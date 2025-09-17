import React, { useState } from 'react';
import { Box, Typography, Tabs, Tab } from '@mui/material';
import ActivityManager from '../components/ActivityManager';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`settings-tabpanel-${index}`}
      aria-labelledby={`settings-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ py: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

export default function Settings() {
  const [tabValue, setTabValue] = useState(0);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Settings
      </Typography>
      
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={tabValue} onChange={handleTabChange}>
          <Tab label="Activities" />
          <Tab label="Categories" />
          <Tab label="Other Settings" />
        </Tabs>
      </Box>
      
      <TabPanel value={tabValue} index={0}>
        <ActivityManager />
      </TabPanel>
      
      <TabPanel value={tabValue} index={1}>
        <Typography variant="h6" gutterBottom>
          Categories Management
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Category management coming soon...
        </Typography>
      </TabPanel>
      
      <TabPanel value={tabValue} index={2}>
        <Typography variant="h6" gutterBottom>
          Other Settings
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Additional settings will include:
        </Typography>
        <ul>
          <li>Pomodoro timer customization</li>
          <li>Notification preferences</li>
          <li>Theme and appearance options</li>
        </ul>
      </TabPanel>
    </Box>
  );
}
