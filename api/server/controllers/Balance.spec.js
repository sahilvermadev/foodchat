const mockFindBalanceByUser = jest.fn();

jest.mock('~/models', () => ({
  findBalanceByUser: mockFindBalanceByUser,
}));

const balanceController = require('./Balance');

function createResponse() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

describe('balanceController', () => {
  beforeEach(() => {
    mockFindBalanceByUser.mockReset();
  });

  it('returns an empty balance instead of a 404 when no balance record exists', async () => {
    mockFindBalanceByUser.mockResolvedValue(null);
    const req = { user: { id: 'user-1' } };
    const res = createResponse();

    await balanceController(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      tokenCredits: 0,
      autoRefillEnabled: false,
    });
  });

  it('returns an existing balance without internal fields', async () => {
    mockFindBalanceByUser.mockResolvedValue({
      _id: 'balance-1',
      user: 'user-1',
      tokenCredits: 1200,
      autoRefillEnabled: false,
      refillIntervalValue: 30,
      refillIntervalUnit: 'days',
      lastRefill: '2026-01-01T00:00:00.000Z',
      refillAmount: 500,
    });
    const req = { user: { id: 'user-1' } };
    const res = createResponse();

    await balanceController(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      user: 'user-1',
      tokenCredits: 1200,
      autoRefillEnabled: false,
    });
  });
});
