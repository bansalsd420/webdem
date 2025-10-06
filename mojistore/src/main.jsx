import { createRoot } from 'react-dom/client';
import { StrictMode } from 'react';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { store } from './redux/store.js';
import './styles/index.css';
import { AuthProvider } from './state/auth.jsx';
import { WishlistProvider } from './state/Wishlist.jsx';
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Provider store={store}>
      <BrowserRouter>
        <AuthProvider>
           <WishlistProvider>
          <App />
          </WishlistProvider>
        </AuthProvider>
      </BrowserRouter>
    </Provider>
  </StrictMode>
);
