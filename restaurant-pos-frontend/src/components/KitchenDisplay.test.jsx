import React from 'react';
import { render, screen } from '@testing-library/react';
import KitchenDisplay from './KitchenDisplay';

// Mock Socket.io-client
jest.mock('socket.io-client', () => {
  const socketMock = {
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn()
  };
  return {
    __esModule: true,
    default: jest.fn(() => socketMock),
    io: jest.fn(() => socketMock)
  };
});

// Mock api
jest.mock('../api', () => ({
  __esModule: true,
  api: {
    get: jest.fn(() => Promise.resolve({ data: { success: true, data: [] } })),
    put: jest.fn(() => Promise.resolve({ data: { success: true } }))
  }
}));

describe('KitchenDisplay Component (KDS)', () => {
  it('renders KDS header and Pure Veg badge', async () => {
    render(<KitchenDisplay />);

    expect(screen.getByText(/KDS Live Kitchen Display/i)).toBeInTheDocument();
    expect(screen.getByText(/PURE VEG KITCHEN/i)).toBeInTheDocument();
  });

  it('renders station filter buttons', () => {
    render(<KitchenDisplay />);

    expect(screen.getByText(/All Stations/i)).toBeInTheDocument();
    expect(screen.getByText(/Main Kitchen/i)).toBeInTheDocument();
    expect(screen.getByText(/Tandoor/i)).toBeInTheDocument();
  });
});
