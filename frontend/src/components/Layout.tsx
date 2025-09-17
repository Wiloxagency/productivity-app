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
    <div>
      <Toolbar>
        {!collapsed && (
          <Typography variant="h6" noWrap>
            Productivity App
          </Typography>
        )}
      </Toolbar>
      <List>
        {menuItems.map((item) => (
          <ListItem key={item.text} disablePadding>
            <ListItemButton
              selected={location.pathname === item.path}
              onClick={() => navigate(item.path)}
              sx={{
                minHeight: 48,
                justifyContent: collapsed ? 'center' : 'initial',
                px: 2.5,
              }}
            >
              <ListItemIcon
                sx={{
                  minWidth: 0,
                  mr: collapsed ? 'auto' : 3,
                  justifyContent: 'center',
                }}
              >
                {item.icon}
              </ListItemIcon>
              {!collapsed && <ListItemText primary={item.text} />}
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </div>
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
          
          <Typography variant="h6" noWrap>
            {menuItems.find(item => item.path === location.pathname)?.text || 'Productivity App'}
          </Typography>
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
