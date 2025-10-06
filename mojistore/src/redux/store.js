//src/redux/store.js
import { configureStore } from '@reduxjs/toolkit';
import cart from './slices/cartSlice.js';


export const store = configureStore({
  reducer: { cart}
});
