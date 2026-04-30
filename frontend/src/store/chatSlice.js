import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { askQuestion } from "../api/axios";

export const sendQuestion = createAsyncThunk(
  "chat/sendQuestion",
  async ({ question, sessionId, signal }) =>
    await askQuestion(question, sessionId, signal)
);

const chatSlice = createSlice({
  name: "chat",
  initialState: {
    messages:  [],
    input:     "",
    loading:   false,
    error:     "",
    sessionId: null,  
  },
  reducers: {
    setInput: (state, { payload }) => { state.input = payload; },

    clearChat: (state) => {
      Object.assign(state, {
        messages:  [],
        input:     "",
        loading:   false,
        error:     "",
        sessionId: null,
      });
    },

    loadSessionMessages: (state, { payload }) => {
      state.messages  = (payload.messages ?? []).map((m) => ({
        id:   m.id,
        role: m.role,
        text: m.text,
      }));
      state.sessionId = payload.id;
      state.input     = "";
      state.loading   = false;
      state.error     = "";
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(sendQuestion.pending, (state, { meta }) => {
        state.loading = true;
        state.error   = "";
        state.input   = "";
        state.messages.push({
          id:   crypto.randomUUID(),
          role: "user",
          text: meta.arg.question,
        });
      })
      .addCase(sendQuestion.fulfilled, (state, { payload }) => {
        state.loading   = false;
      
        state.sessionId = payload.session_id ?? state.sessionId;
        state.messages.push({
          id:   crypto.randomUUID(),
          role: "bot",
          text: payload.answer ?? "(No answer returned)",
        });
      })
      .addCase(sendQuestion.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.loading = false;
        state.error   = "Could not reach the backend.";
        state.messages.push({
          id:   crypto.randomUUID(),
          role: "bot",
          text: "Sorry, I couldn't reach the backend.",
        });
      });
  },
});

export const { setInput, clearChat, loadSessionMessages } = chatSlice.actions;
export default chatSlice.reducer;
