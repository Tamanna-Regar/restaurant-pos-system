import React from 'react';
import { render } from '@testing-library/react';

// Pure mock of react-router-dom to prevent Jest ESM resolution issue
jest.mock('react-router-dom', () => ({
  useNavigate: () => jest.fn(),
  useLocation: () => ({ pathname: '/' }),
  useParams: () => ({ tableId: '1' }),
  Routes: ({ children }) => <div data-testid="mock-routes">{children}</div>,
  Route: ({ element }) => <div data-testid="mock-route">{element}</div>,
  Link: ({ children, to }) => <a href={to}>{children}</a>,
  BrowserRouter: ({ children }) => <div>{children}</div>
}));

// Mock react-hot-toast
jest.mock('react-hot-toast', () => {
  const toast = {
    error: jest.fn(),
    success: jest.fn(),
    loading: jest.fn()
  };
  return {
    __esModule: true,
    default: toast,
    toast,
    Toaster: () => <div data-testid="toaster" />
  };
});

import App from './App';

test('renders Tamanna Restaurant POS without crashing', () => {
  const { container } = render(<App />);
  expect(container).toBeDefined();
});
