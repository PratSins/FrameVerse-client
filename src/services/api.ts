import { getFreshAccessToken, getStoredSession } from "./auth";
import { TOONIFY_API_URL } from "../config";

const API_BASE_URL = TOONIFY_API_URL;

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

async function getEffectiveToken(token?: string | null): Promise<string | null> {
  const fresh = await getFreshAccessToken();
  if (fresh) return fresh;
  if (token) return token;
  const session = getStoredSession();
  return session?.accessToken || null;
}

export async function createUploadUrl(
  contentType: string = "video/mp4",
  style: string = "anime",
  accessToken?: string | null
): Promise<CreateUploadResponse> {
  const cleanType = contentType.split(";")[0].trim() || "video/mp4";
  const token = await getEffectiveToken(accessToken);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}/upload-url`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      content_type: cleanType,
      style: style,
    }),
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("You must be logged in to toonify videos. Please sign in first.");
    }
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

export async function startProcessing(
  jobId: string,
  accessToken?: string | null
): Promise<ProcessJobResponse> {
  const token = await getEffectiveToken(accessToken);
  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}/${jobId}/process`, {
    method: "POST",
    headers,
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("You must be logged in to toonify videos. Please sign in first.");
    }
    const errorText = await response.text();
    throw new Error(`Failed to start processing: ${errorText || response.statusText}`);
  }

  return response.json();
}

export async function getJobStatus(
  jobId: string,
  accessToken?: string | null
): Promise<JobStatusResponse> {
  const token = await getEffectiveToken(accessToken);
  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}/${jobId}`, {
    method: "GET",
    headers,
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("You must be logged in to toonify videos. Please sign in first.");
    }
    const errorText = await response.text();
    throw new Error(`Failed to get job status: ${errorText || response.statusText}`);
  }

  return response.json();
}

export async function pollJobUntilComplete(
  jobId: string,
  accessTokenOrOnPoll?: string | null | ((status: JobStatusResponse) => void),
  onPoll?: (status: JobStatusResponse) => void,
  intervalMs: number = 3000,
  maxTimeoutMs: number = 600000 // 10 minutes
): Promise<JobStatusResponse> {
  let token: string | null = null;
  let pollCallback = onPoll;

  if (typeof accessTokenOrOnPoll === "function") {
    pollCallback = accessTokenOrOnPoll;
  } else if (typeof accessTokenOrOnPoll === "string") {
    token = accessTokenOrOnPoll;
  }

  const startTime = Date.now();

  while (Date.now() - startTime < maxTimeoutMs) {
    const currentToken = await getEffectiveToken(token);
    const job = await getJobStatus(jobId, currentToken);
    if (pollCallback) {
      pollCallback(job);
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
