import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import authRoutes from '../routes/auth';
import prisma from '../db/client';

jest.mock('../db/client', () => ({
  __esModule: true,
  default: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn()
    }
  }
}));

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/auth', authRoutes);

describe('Authentication Routes', () => {
  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    password: '',
    name: 'Test User',
    createdAt: new Date()
  };

  beforeAll(async () => {
    const salt = await bcrypt.genSalt(10);
    mockUser.password = await bcrypt.hash('secretpassword', salt);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('POST /api/auth/register: creates a new user and returns JWT token', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.user.create as jest.Mock).mockResolvedValue({
      id: 'user-123',
      email: 'newuser@example.com',
      name: 'New User',
      createdAt: new Date()
    });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'newuser@example.com', password: 'password123', name: 'New User' });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('newuser@example.com');
    expect(res.body.token).toBeDefined();
    expect(res.headers['set-cookie']).toBeDefined();
  });

  test('POST /api/auth/register: rejects invalid email or short password', async () => {
    const res1 = await request(app)
      .post('/api/auth/register')
      .send({ email: 'invalid-email', password: 'password123' });
    expect(res1.status).toBe(400);

    const res2 = await request(app)
      .post('/api/auth/register')
      .send({ email: 'valid@example.com', password: '123' });
    expect(res2.status).toBe(400);
  });

  test('POST /api/auth/login: successfully authenticates with correct password', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'secretpassword' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.id).toBe('user-123');
  });

  test('POST /api/auth/login: rejects incorrect password', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Invalid');
  });

  test('POST /api/auth/logout: clears auth cookies', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
