import React, { useState } from 'react';
import {
  AppBar,
  Box,
  CssBaseline,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Menu as MenuIcon,
  MenuOpen as MenuOpenIcon,
  Dashboard as DashboardIcon,
  Timer as TimerIcon,
  Assignment as TaskIcon,
  Today as PlanningIcon,
  Analytics as ReportsIcon,
  Settings as SettingsIcon,
  BoltRounded as BrandIcon,
} from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';

const drawerWidth = 240;
const collapsedDrawerWidth = 64;

interface LayoutProps {
  children: React.ReactNode;
}

const menuItems = [
  { text: 'Dashboard', icon: <DashboardIcon />, path: '/' },
  { text: 'Time Tracker', icon: <TimerIcon />, path: '/time-tracker' },
  { text: 'Task Manager', icon: <TaskIcon />, path: '/tasks' },
  { text: 'Daily Planning', icon: <PlanningIcon />, path: '/planning' },
  { text: 'Reports', icon: <ReportsIcon />, path: '/reports' },
  { text: 'Settings', icon: <SettingsIcon />, path: '/settings' },
];

export default function Layout({ children }: LayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleDesktopToggle = () => {
    setDesktopCollapsed(!desktopCollapsed);
  };

  const drawer = (collapsed = false) => (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Toolbar sx={{ px: collapsed ? 1 : 2.5 }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.25,
            width: '100%',
            justifyContent: collapsed ? 'center' : 'flex-start',
          }}
        >
          <Box
            sx={{
              width: 38,
              height: 38,
              borderRadius: 2,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
              boxShadow: '0 6px 16px rgba(79,70,229,0.35)',
            }}
          >
            <BrandIcon fontSize="small" />
          </Box>
          {!collapsed && (
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="subtitle1" noWrap sx={{ fontWeight: 800, lineHeight: 1.15 }}>
                Productivity
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap>
                Time &amp; Focus
              </Typography>
            </Box>
          )}
        </Box>
      </Toolbar>

      <List sx={{ px: 1, py: 1, flexGrow: 1 }}>
        {menuItems.map((item) => {
          const selected = location.pathname === item.path;
          const button = (
            <ListItemButton
              selected={selected}
              onClick={() => navigate(item.path)}
              sx={{
                minHeight: 46,
                justifyContent: collapsed ? 'center' : 'initial',
                px: 2,
              }}
            >
              <ListItemIcon
                sx={{
                  minWidth: 0,
                  mr: collapsed ? 'auto' : 2.25,
                  justifyContent: 'center',
                  color: selected ? 'primary.main' : 'text.secondary',
                }}
              >
                {item.icon}
              </ListItemIcon>
              {!collapsed && (
                <ListItemText
                  primary={item.text}
                  primaryTypographyProps={{ fontWeight: 600, fontSize: 14 }}
                />
              )}
            </ListItemButton>
          );

          return (
            <ListItem key={item.text} disablePadding sx={{ display: 'block', mb: 0.5 }}>
              {collapsed ? (
                <Tooltip title={item.text} placement="right">
                  {button}
                </Tooltip>
              ) : (
                button
              )}
            </ListItem>
          );
        })}
      </List>

      {!collapsed && (
        <Box sx={{ p: 2 }}>
          <Typography variant="caption" color="text.secondary">
            Productivity App · v1
          </Typography>
        </Box>
      )}
    </Box>
  );

  return (
    <Box sx={{ display: 'flex' }}>
      <CssBaseline />
      <AppBar
        position="fixed"
        sx={{
          width: { 
            sm: `calc(100% - ${desktopCollapsed ? collapsedDrawerWidth : drawerWidth}px)` 
          },
          ml: { 
            sm: `${desktopCollapsed ? collapsedDrawerWidth : drawerWidth}px` 
          },
          transition: 'width 0.3s, margin 0.3s',
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { sm: 'none' } }}
          >
            <MenuIcon />
          </IconButton>
          
          <IconButton
            color="inherit"
            aria-label="toggle sidebar"
            edge="start"
            onClick={handleDesktopToggle}
            sx={{ mr: 2, display: { xs: 'none', sm: 'block' } }}
          >
            {desktopCollapsed ? <MenuIcon /> : <MenuOpenIcon />}
          </IconButton>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
            <Box
              sx={{
                display: { xs: 'none', sm: 'flex' },
                alignItems: 'center',
                justifyContent: 'center',
                color: 'primary.main',
              }}
            >
              {menuItems.find((item) => item.path === location.pathname)?.icon}
            </Box>
            <Typography variant="h6" noWrap sx={{ fontWeight: 700 }}>
              {menuItems.find((item) => item.path === location.pathname)?.text || 'Productivity App'}
            </Typography>
          </Box>
        </Toolbar>
      </AppBar>
      <Box
        component="nav"
        sx={{ 
          width: { sm: desktopCollapsed ? collapsedDrawerWidth : drawerWidth }, 
          flexShrink: { sm: 0 },
          transition: 'width 0.3s',
        }}
        aria-label="navigation"
      >
        {/* Mobile Drawer */}
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{
            keepMounted: true,
          }}
          sx={{
            display: { xs: 'block', sm: 'none' },
            '& .MuiDrawer-paper': { 
              boxSizing: 'border-box', 
              width: drawerWidth,
            },
          }}
        >
          {drawer(false)}
        </Drawer>
        
        {/* Desktop Drawer */}
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', sm: 'block' },
            '& .MuiDrawer-paper': { 
              boxSizing: 'border-box', 
              width: desktopCollapsed ? collapsedDrawerWidth : drawerWidth,
              transition: 'width 0.3s',
              overflowX: 'hidden',
            },
          }}
          open
        >
          {drawer(desktopCollapsed)}
        </Drawer>
      </Box>
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          width: { 
            sm: `calc(100% - ${desktopCollapsed ? collapsedDrawerWidth : drawerWidth}px)` 
          },
          transition: 'width 0.3s',
        }}
      >
        <Toolbar />
        {children}
      </Box>
    </Box>
  );
}
