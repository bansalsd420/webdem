/* src/layouts/Layout.jsx */
import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Navbar from '../components/Navbar/Navbar.jsx';
import SubNavbar from '../components/SubNavbar/SubNavbar.jsx';
import Footer from '../components/Footer/Footer.jsx';
import Shell from './Shell.jsx';
import { SideNavProvider } from './SideNavContext.jsx';
import { bootstrapLocations } from '../utils/locations';

export default function Layout() {
  useEffect(() => { void bootstrapLocations(); }, []);

  return (
    <SideNavProvider>
      <Shell>
        <div className="ms-app-grid">
          <Navbar />
          <SubNavbar />
          <main id="ms-main" className="ms-main" role="main">
            <Outlet />
          </main>
          <Footer />
        </div>
      </Shell>
    </SideNavProvider>
  );
}
