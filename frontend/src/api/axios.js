import axios from "axios";

const API = axios.create({
  baseURL: "http://127.0.0.1:8000",
});

// Normalises error messages once here rather than duplicating logic in every thunk.
API.interceptors.response.use(
  (res) => res,
  (err) => {
    const msg =
      err.response?.data?.detail ??
      err.response?.data?.message ??
      err.message ??
      "Unknown error";
    return Promise.reject(new Error(msg));
  }
);

// ── Resumes ───────────────────────────────────────────────────────────────────
export const fetchResumes = async () =>
  (await API.get("/resumes")).data.resumes ?? [];

// Backend accepts multiple files at /upload, returns { status, files_added }
export const uploadResume = async (file) => {
  const form = new FormData();
  form.append("files", file);   // key is "files" (List[UploadFile])
  return (await API.post("/upload", form)).data;
};

// ── Chat ──────────────────────────────────────────────────────────────────────
// Returns { answer, session_id }
export const askQuestion = async (question, sessionId, signal) =>
  (
    await API.post(
      "/chat",
      { question, session_id: sessionId ?? crypto.randomUUID() },
      { signal },
    )
  ).data;
