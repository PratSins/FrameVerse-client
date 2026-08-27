const API_BASE_URL = "http://localhost:8080/api/v1/toonify";

export interface CreateUploadResponse {
  job_id: string;
  upload_url: string;
  object: string;
}

export interface ProcessJobResponse {
  job_id: string;
  status: string;
}

export interface JobStatusResponse {
  job_id: string;
  status: "pending" | "processing" | "completed" | "failed";
  style: string;
  download_url?: string;
  error?: string;
}

export async function createUploadUrl(
  contentType: string = "video/mp4",
  style: string = "anime"
): Promise<CreateUploadResponse> {
  const cleanType = contentType.split(";")[0].trim() || "video/mp4";

  const response = await fetch(`${API_BASE_URL}/upload-url`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      content_type: cleanType,
      style: style,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get upload URL: ${errorText || response.statusText}`);
  }

  return response.json();
}

export async function uploadVideoToGCS(
  uploadUrl: string,
  videoBlob: Blob | File,
  contentType: string = "video/mp4"
): Promise<void> {
  const cleanType = contentType.split(";")[0].trim() || "video/mp4";

  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": cleanType,
    },
    body: videoBlob,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to upload video to Cloud Storage (${response.status}): ${errorText || response.statusText}`);
  }
}

export async function startProcessing(jobId: string): Promise<ProcessJobResponse> {
  const response = await fetch(`${API_BASE_URL}/${jobId}/process`, {
    method: "POST",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to start processing: ${errorText || response.statusText}`);
  }

  return response.json();
}

export async function getJobStatus(jobId: string): Promise<JobStatusResponse> {
  const response = await fetch(`${API_BASE_URL}/${jobId}`, {
    method: "GET",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get job status: ${errorText || response.statusText}`);
  }

  return response.json();
}

export async function pollJobUntilComplete(
  jobId: string,
  onPoll?: (status: JobStatusResponse) => void,
  intervalMs: number = 3000,
  maxTimeoutMs: number = 600000 // 10 minutes
): Promise<JobStatusResponse> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxTimeoutMs) {
    const job = await getJobStatus(jobId);
    if (onPoll) {
      onPoll(job);
    }

    if (job.status === "completed") {
      return job;
    }

    if (job.status === "failed") {
      throw new Error(job.error || "Video processing failed on server.");
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error("Video processing timed out after 10 minutes.");
}
