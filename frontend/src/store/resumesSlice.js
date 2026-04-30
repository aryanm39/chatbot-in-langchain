import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { fetchResumes, uploadResume } from "../api/axios";

export const loadResumes = createAsyncThunk(
  "resumes/load",
  async () => await fetchResumes()
);

export const uploadNewResume = createAsyncThunk(
  "resumes/upload",
  async (file, { dispatch }) => {
    const data = await uploadResume(file);
    dispatch(loadResumes());
    return data;
  }
);

const resumesSlice = createSlice({
  name: "resumes",
  initialState: {
    list:         [],
    loadingList:  false,
    uploading:    false,
    uploadStatus: "",
    uploadError:  "",
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(loadResumes.pending,   (state) => { state.loadingList = true; })
      .addCase(loadResumes.fulfilled, (state, { payload }) => {
        state.loadingList = false;
        state.list        = payload;
      })
      .addCase(loadResumes.rejected,  (state) => { state.loadingList = false; })

      .addCase(uploadNewResume.pending, (state) => {
        state.uploading    = true;
        state.uploadStatus = "";
        state.uploadError  = "";
      })
      .addCase(uploadNewResume.fulfilled, (state, { payload }) => {
        state.uploading = false;
        const added = payload.files_added ?? [];
        if (added.length > 0) {
          state.uploadStatus = `✓ "${added.join(", ")}" uploaded.`;
          for (const f of added) {
            if (!state.list.includes(f)) state.list.push(f);
          }
        } else {
          state.uploadStatus = "File processed (already indexed).";
        }
      })
      .addCase(uploadNewResume.rejected, (state, action) => {
        state.uploading   = false;
        state.uploadError = action.error.message ?? "Upload failed.";
      });
  },
});

export default resumesSlice.reducer;
