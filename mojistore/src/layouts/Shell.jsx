import SideNav from '../components/SideNav/SideNav.jsx';
import { useSideNav } from './SideNavContext.jsx';
import '../components/SideNav/sidenav.css';   // <— ensure CSS is bundled
import './shell.css';


export default function Shell({ children }) {
  const { open } = useSideNav();
  return (
    <div className={`shell ${open ? 'shell-with-sidenav' : ''}`}>
      <SideNav />
      <div className="shell-main" id="main">
        {children}
      </div>
    </div>
  );
}
