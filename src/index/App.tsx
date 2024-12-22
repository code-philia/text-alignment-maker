import '@mantine/core/styles.css';
import '@mantine/carousel/styles.css';
import './App.css';

import { Center, createTheme, MantineProvider, ScrollArea } from '@mantine/core';
import { Feature } from '../components/feature';

const theme = createTheme({
  /** Put your mantine theme override here */
});

function App() {
  return (
    <MantineProvider theme={theme}>
      <ScrollArea h='100%' p='2em 0'>
        <Center>
          <Feature />
        </Center>
      </ScrollArea>
    </MantineProvider>
  );
}

export default App;
