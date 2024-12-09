import '@mantine/core/styles.css';
import '@mantine/carousel/styles.css';
import './App.css';

import { createTheme, MantineProvider } from '@mantine/core';
import { Feature } from './components/feature';

const theme = createTheme({
  /** Put your mantine theme override here */
});

function App() {
  return (
    <MantineProvider theme={theme}>
      <Feature />
    </MantineProvider>
  );
}

export default App;
