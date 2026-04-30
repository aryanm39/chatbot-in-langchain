import { createSlice } from "@reduxjs/toolkit";

const sessionsSlice = createSlice({
  name: "sessions",
  initialState: {
    list:     [],   
    activeId: null,
    loading:  false,
  },
  reducers: {
    setActiveSession: (state, { payload }) => {
      state.activeId = payload;
    },

    upsertSession: (state, { payload }) => {
      const idx = state.list.findIndex((s) => s.id === payload.id);
      if (idx === -1) {
        state.list.unshift(payload);
      } else {
        state.list[idx] = { ...state.list[idx], ...payload };
      }
      state.activeId = payload.id;
    },

    deleteSession: (state, { payload: sessionId }) => {
      state.list = state.list.filter((s) => s.id !== sessionId);
      if (state.activeId === sessionId) state.activeId = null;
    },
  },
});

export const { setActiveSession, upsertSession, deleteSession } = sessionsSlice.actions;
export default sessionsSlice.reducer;
