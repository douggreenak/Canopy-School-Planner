'use client';
import { useState, useEffect, Suspense } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Box from '@mui/material/Box';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Drawer from '@mui/material/Drawer';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Divider from '@mui/material/Divider';
import Tooltip from '@mui/material/Tooltip';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import MenuIcon from '@mui/icons-material/Menu';
import DashboardIcon from '@mui/icons-material/Dashboard';
import SchoolIcon from '@mui/icons-material/School';
import QuizIcon from '@mui/icons-material/Quiz';
import ChecklistIcon from '@mui/icons-material/Checklist';
import GradingIcon from '@mui/icons-material/Grading';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import SettingsIcon from '@mui/icons-material/Settings';
import LogoutIcon from '@mui/icons-material/Logout';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import MenuOpenIcon from '@mui/icons-material/MenuOpen';
import LoadingOverlay from '@/components/LoadingOverlay';
import SetupWizard from '@/components/SetupWizard';
import LoginScreen from '@/components/LoginScreen';

const DRAWER_WIDTH = 256;
const COLLAPSED_WIDTH = 64;
const COLLAPSE_KEY = 'sp-sidebar-collapsed';

interface NavItem {
  label: string;
  icon: React.ReactNode;
  path: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', icon: <DashboardIcon />, path: '/' },
  { label: 'Classes', icon: <SchoolIcon />, path: '/classes' },
  { label: 'Schedule', icon: <CalendarMonthIcon />, path: '/schedule' },
  { label: 'Grades', icon: <GradingIcon />, path: '/grades' },
  { label: 'Exams', icon: <QuizIcon />, path: '/exams' },
  { label: 'Tasks', icon: <ChecklistIcon />, path: '/tasks' },
  { label: 'Settings', icon: <SettingsIcon />, path: '/settings' },
];

function isNavItemActive(item: NavItem, pathname: string, currentTab: string | null): boolean {
  if (item.path === '/') return pathname === '/';
  const [itemPath, itemQuery] = item.path.split('?');
  if (!pathname.startsWith(itemPath)) return false;
  if (itemQuery) {
    const itemTab = new URLSearchParams(itemQuery).get('tab');
    return currentTab === itemTab;
  }
  const siblingClaimsTab = NAV_ITEMS.some((other) => {
    if (other === item) return false;
    const [otherPath, otherQuery] = other.path.split('?');
    if (otherPath !== itemPath || !otherQuery) return false;
    const otherTab = new URLSearchParams(otherQuery).get('tab');
    return otherTab === currentTab;
  });
  return !siblingClaimsTab;
}

function NavListInner({
  onItemClick,
  collapsed,
}: {
  onItemClick: (path: string) => void;
  collapsed: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentTab = searchParams.get('tab');

  return (
    <List sx={{ px: collapsed ? 0.5 : 1, pt: 1 }}>
      {NAV_ITEMS.map((item) => {
        const isActive = isNavItemActive(item, pathname, currentTab);
        const btn = (
          <ListItemButton
            key={item.label}
            selected={isActive}
            onClick={() => onItemClick(item.path)}
            sx={{
              mb: 0.5,
              justifyContent: collapsed ? 'center' : 'flex-start',
              px: collapsed ? 1 : 2,
              minHeight: 44,
            }}
          >
            <ListItemIcon
              sx={{
                minWidth: collapsed ? 0 : 40,
                color: isActive ? 'primary.main' : 'text.secondary',
                justifyContent: 'center',
              }}
            >
              {item.icon}
            </ListItemIcon>
            {!collapsed && (
              <ListItemText
                primary={item.label}
                slotProps={{ primary: { sx: { fontSize: '0.875rem', fontWeight: isActive ? 600 : 400 } } }}
              />
            )}
          </ListItemButton>
        );
        return collapsed ? (
          <Tooltip key={item.label} title={item.label} placement="right">
            {btn}
          </Tooltip>
        ) : btn;
      })}
    </List>
  );
}

function NavListFallback({
  onItemClick,
  collapsed,
}: {
  onItemClick: (path: string) => void;
  collapsed: boolean;
}) {
  return (
    <List sx={{ px: collapsed ? 0.5 : 1, pt: 1 }}>
      {NAV_ITEMS.map((item) => (
        <ListItemButton
          key={item.label}
          onClick={() => onItemClick(item.path)}
          sx={{
            mb: 0.5,
            justifyContent: collapsed ? 'center' : 'flex-start',
            px: collapsed ? 1 : 2,
            minHeight: 44,
          }}
        >
          <ListItemIcon
            sx={{
              minWidth: collapsed ? 0 : 40,
              color: 'text.secondary',
              justifyContent: 'center',
            }}
          >
            {item.icon}
          </ListItemIcon>
          {!collapsed && (
            <ListItemText
              primary={item.label}
              slotProps={{ primary: { sx: { fontSize: '0.875rem' } } }}
            />
          )}
        </ListItemButton>
      ))}
    </List>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const router = useRouter();

  // Restore collapse preference from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(COLLAPSE_KEY);
    if (stored === 'true') setCollapsed(true);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(COLLAPSE_KEY, String(next));
      return next;
    });
  };

  // Auth state — null = loading, false = logged out, object = logged in
  const [currentUser, setCurrentUser] = useState<{ id: string; username: string } | null | false>(null);

  useEffect(() => {
    fetch('/api/auth')
      .then((r) => r.json())
      .then((data) => setCurrentUser(data.user ?? false))
      .catch(() => setCurrentUser(false));
  }, []);

  const handleNavClick = (path: string) => {
    router.push(path);
    if (isMobile) setMobileOpen(false);
  };

  const [wizardOpen, setWizardOpen] = useState(false);

  useEffect(() => {
    const handler = () => setWizardOpen(true);
    window.addEventListener('open-setup-wizard', handler);
    return () => window.removeEventListener('open-setup-wizard', handler);
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    fetch('/api/setup/health')
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok && data.error === 'Missing credentials') {
          if (typeof window !== 'undefined' && !localStorage.getItem('sp-wizard-dismissed')) {
            setWizardOpen(true);
          }
        }
      })
      .catch(() => {});
  }, [currentUser]);

  const doLogout = async () => {
    await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'logout' }),
    }).catch(() => {});
    setCurrentUser(false);
    router.push('/');
  };

  if (currentUser === null) {
    return <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }} />;
  }

  if (currentUser === false) {
    return <LoginScreen onLogin={(user) => setCurrentUser(user)} />;
  }

  const drawerWidth = isMobile ? DRAWER_WIDTH : collapsed ? COLLAPSED_WIDTH : DRAWER_WIDTH;

  const drawerContent = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header — hamburger toggle (desktop) or branding (mobile) */}
      <Toolbar
        sx={{
          gap: 1,
          justifyContent: collapsed && !isMobile ? 'center' : 'flex-start',
          px: collapsed && !isMobile ? 0.5 : 1,
          minHeight: 64,
        }}
      >
        {!isMobile ? (
          /* Desktop: hamburger opens/closes the rail */
          <>
            <Tooltip title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} placement="right">
              <IconButton onClick={toggleCollapsed} size="small" sx={{ color: 'text.secondary' }}>
                {collapsed ? <MenuIcon /> : <MenuOpenIcon />}
              </IconButton>
            </Tooltip>
            {!collapsed && (
              <>
                <SchoolIcon sx={{ color: 'primary.main', fontSize: 26, flexShrink: 0 }} />
                <Typography variant="h6" noWrap sx={{ fontWeight: 500, color: 'primary.main', flex: 1 }}>
                  School Planner
                </Typography>
              </>
            )}
          </>
        ) : (
          /* Mobile: just branding (hamburger is in the AppBar) */
          <>
            <SchoolIcon sx={{ color: 'primary.main', fontSize: 28, flexShrink: 0 }} />
            <Typography variant="h6" noWrap sx={{ fontWeight: 500, color: 'primary.main', flex: 1 }}>
              School Planner
            </Typography>
          </>
        )}
      </Toolbar>

      <Divider />

      {/* Nav items */}
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        <Suspense fallback={<NavListFallback onItemClick={handleNavClick} collapsed={collapsed && !isMobile} />}>
          <NavListInner onItemClick={handleNavClick} collapsed={collapsed && !isMobile} />
        </Suspense>
      </Box>

      <Divider />

      {/* Bottom: user + logout + collapse toggle */}
      <List sx={{ px: collapsed && !isMobile ? 0.5 : 1, pb: 0.5 }}>
        {/* Username row */}
        {collapsed && !isMobile ? (
          <Tooltip title={currentUser.username} placement="right">
            <ListItemButton disabled sx={{ justifyContent: 'center', px: 1, minHeight: 44, opacity: 0.7 }}>
              <ListItemIcon sx={{ minWidth: 0, justifyContent: 'center', color: 'text.secondary' }}>
                <AccountCircleIcon />
              </ListItemIcon>
            </ListItemButton>
          </Tooltip>
        ) : (
          <ListItemButton disabled sx={{ borderRadius: 1, opacity: 0.7 }}>
            <ListItemIcon sx={{ minWidth: 40, color: 'text.secondary' }}>
              <AccountCircleIcon />
            </ListItemIcon>
            <ListItemText
              primary={currentUser.username}
              slotProps={{ primary: { sx: { fontSize: '0.875rem', fontWeight: 500 } } }}
            />
          </ListItemButton>
        )}

        {/* Sign out */}
        {collapsed && !isMobile ? (
          <Tooltip title="Sign Out" placement="right">
            <ListItemButton onClick={doLogout} sx={{ justifyContent: 'center', px: 1, minHeight: 44 }}>
              <ListItemIcon sx={{ minWidth: 0, justifyContent: 'center', color: 'text.secondary' }}>
                <LogoutIcon />
              </ListItemIcon>
            </ListItemButton>
          </Tooltip>
        ) : (
          <ListItemButton onClick={doLogout} sx={{ borderRadius: 1 }}>
            <ListItemIcon sx={{ minWidth: 40, color: 'text.secondary' }}>
              <LogoutIcon />
            </ListItemIcon>
            <ListItemText primary="Sign Out" slotProps={{ primary: { sx: { fontSize: '0.875rem' } } }} />
          </ListItemButton>
        )}

      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <LoadingOverlay />
      <SetupWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />

      {/* Mobile top bar */}
      {isMobile && (
        <AppBar position="fixed" sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}>
          <Toolbar>
            <IconButton edge="start" onClick={() => setMobileOpen(!mobileOpen)} sx={{ mr: 1 }}>
              <MenuIcon />
            </IconButton>
            <SchoolIcon sx={{ color: 'primary.main', mr: 1 }} />
            <Typography variant="h6" noWrap sx={{ fontWeight: 500, flex: 1 }}>
              School Planner
            </Typography>
          </Toolbar>
        </AppBar>
      )}

      {/* Sidebar */}
      <Box
        component="nav"
        sx={{
          width: { md: drawerWidth },
          flexShrink: { md: 0 },
          transition: theme.transitions.create('width', {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.enteringScreen,
          }),
        }}
      >
        {isMobile ? (
          <Drawer
            variant="temporary"
            open={mobileOpen}
            onClose={() => setMobileOpen(false)}
            ModalProps={{ keepMounted: true }}
            sx={{ '& .MuiDrawer-paper': { width: DRAWER_WIDTH } }}
          >
            {drawerContent}
          </Drawer>
        ) : (
          <Drawer
            variant="permanent"
            open
            sx={{
              '& .MuiDrawer-paper': {
                width: drawerWidth,
                boxSizing: 'border-box',
                overflowX: 'hidden',
                transition: theme.transitions.create('width', {
                  easing: theme.transitions.easing.sharp,
                  duration: theme.transitions.duration.enteringScreen,
                }),
              },
            }}
          >
            {drawerContent}
          </Drawer>
        )}
      </Box>

      {/* Main content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          mt: isMobile ? '64px' : 0,
          minWidth: 0,
          bgcolor: 'background.default',
          minHeight: '100vh',
          transition: theme.transitions.create('margin', {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.enteringScreen,
          }),
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
