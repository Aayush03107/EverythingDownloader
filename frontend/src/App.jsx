/* src/App.jsx */
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Converter from './Converter';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-zinc-900 text-white flex justify-center items-center font-sans">
        <Routes>
          <Route path="/" element={<Converter />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;