//src/redux/slices/authSlice.js
import { createSlice } from '@reduxjs/toolkit';

const slice = createSlice({
  name: 'auth',
  initialState: { token: null, contact_id: null, price_group_id: null },
  reducers: {
    loginOk(state, { payload }) {
      state.token = payload.token;
      state.contact_id = payload.contact_id;
      state.price_group_id = payload.price_group_id;
      localStorage.setItem('jwt', payload.token);
    },
    logout(state) {
      state.token = null;
      state.contact_id = null;
      state.price_group_id = null;
      localStorage.removeItem('jwt');
    }
  }
});

export const { loginOk, logout } = slice.actions;
export default slice.reducer;
