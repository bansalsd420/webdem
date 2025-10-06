/* src/layouts/Layout.jsx */
import { Outlet } from 'react-router-dom';
import Navbar from '../components/Navbar/Navbar.jsx';
import SubNavbar from '../components/SubNavbar/SubNavbar.jsx';
import Footer from '../components/Footer/Footer.jsx';
import Shell from './Shell.jsx';
import { SideNavProvider } from './SideNavContext.jsx';   // <-- add this import

export default function Layout() {
  return (
    <SideNavProvider>                                   {/* <-- wrap everything */}
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
