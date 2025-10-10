/* src/layouts/Layout.jsx */
import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import Navbar from '../components/Navbar/Navbar.jsx';
import SubNavbar from '../components/SubNavbar/SubNavbar.jsx';
import Footer from '../components/Footer/Footer.jsx';
import Shell from './Shell.jsx';
import { SideNavProvider } from './SideNavContext.jsx';
import { bootstrapLocations } from '../utils/locations';

export default function Layout() {
  useEffect(() => { void bootstrapLocations(); }, []);
  // Client-only viewport check to decide whether to render the SubNavbar.
  // This avoids hydration mismatches by computing on the client inside useEffect.
  const [showSubnav, setShowSubnav] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    // showSubnav should be true for screens >= 1024px (laptop/desktop)
    const update = () => setShowSubnav(mq.matches);
    update();
    try { mq.addEventListener?.('change', update); } catch (e) { mq.addListener?.(update); }
    return () => { try { mq.removeEventListener?.('change', update); } catch (e) { mq.removeListener?.(update); } };
  }, []);

  return (
    <SideNavProvider>
      <Shell>
        <div className="ms-app-grid">
          <Navbar />
          {showSubnav && <SubNavbar />}
          <main id="ms-main" className="ms-main" role="main">
            <Outlet />
          </main>
          <Footer />
        </div>
      </Shell>
    </SideNavProvider>
  );
}
