import { Request, Response } from 'express';
import prisma from '../prisma/client.ts';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import stripe from '../services/stripe.ts';
import { OAuth2Client } from 'google-auth-library';
import { publishEvent } from '../messaging/publisher.ts';

// You will eventually put your real Google Client ID in your .env file
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID || 'mock-client-id');

// Validation schema for signup
const signupSchema = z.object({
  email: z.email(),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string().optional(),
  role: z.enum(['EV_USER', 'PROVIDER_ADMIN']).optional(),
});

// Validation schema for signin
const signinSchema = z.object({
    email: z.email(),
    password: z.string(),
});

export const signUp = async (req: Request, res: Response) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: z.treeifyError(parsed.error) });
  }

  try {
    const { email, password, firstName, lastName, phone } = parsed.data;
    const role = parsed.data.role ?? 'EV_USER';

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ error: 'A user with this email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    // Create the core identity in the Auth database
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        role,
        // We removed stripeCustomerId, firstName, lastName, etc. from this schema earlier!
      },
    });

    // 🚀 THE MICROSERVICE MAGIC HAPPENS HERE
    // Instead of forcing data into other databases, we just broadcast what happened.
    await publishEvent('user.registered', {
      userId: user.id,
      email: user.email,
      role: user.role,
      firstName, // The User Profile service needs this
      lastName,  // The User Profile service needs this
      phone,     // The User Profile service needs this
    });

    res.status(201).json({
        message: "Account created successfully",
        userId: user.id
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Failed to create account' });
  }
};

export const signIn = async (req: Request, res: Response) => {
    const parsed = signinSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: z.treeifyError(parsed.error) });
    }

    try {
        const { email, password } = parsed.data;
        const user = await prisma.user.findUnique({ where: { email } });

        if (!user) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const isPasswordCorrect = user.password
          ? await bcrypt.compare(password, user.password)
          : false;

        if (!isPasswordCorrect) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const token = jwt.sign(
            { userId: user.id, role: user.role },
            process.env.JWT_SECRET || 'a-very-secret-key',
            { expiresIn: '24h' }
        );

        res.status(200).json({ token });

    } catch (err) {
        console.error('Signin error:', err);
        res.status(500).json({ error: 'Authentication failed' });
    }
};

export const googleLogin = async (req: Request, res: Response) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ error: 'Google token is required' });
  }

  try {
    // 1. Verify the Google Token
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID, 
    });
    const payload = ticket.getPayload();

    if (!payload || !payload.email) {
      return res.status(400).json({ error: 'Invalid Google token payload' });
    }

    const { email, sub: googleId, given_name: firstName, family_name: lastName } = payload;

    // 2. Check if user already exists
    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { googleId: googleId },
          { email: email }
        ]
      }
    });

    // 3. If user doesn't exist, create them as an EV_USER
    if (!user) {
      // Create the core identity in the Auth database
      user = await prisma.user.create({
        data: {
          email,
          googleId,
          authProvider: 'GOOGLE',
          role: 'EV_USER',
        },
      });

      // 🚀 THE MICROSERVICE MAGIC
      // Broadcast the new user. 
      // - The User Service will catch this and create the profile (firstName, lastName).
      // - The Billing Service will catch this and create the Stripe Customer.
      // - The Audit Service will catch this and log the registration.
      await publishEvent('user.registered', {
        userId: user.id,
        email: user.email,
        role: user.role,
        authProvider: 'GOOGLE',
        firstName: firstName || '',
        lastName: lastName || '',
      });

    } else if (!user.googleId) {
      // If user exists by email but hasn't linked Google yet, link it
      user = await prisma.user.update({
        where: { email },
        data: { googleId, authProvider: 'GOOGLE' }
      });
    }

    // 4. Generate our system's standard JWT
    const jwtToken = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET || 'a-very-secret-key',
      { expiresIn: '24h' }
    );

    res.status(200).json({ 
      token: jwtToken, 
      user: { id: user.id, email: user.email, role: user.role } 
    });

  } catch (err: unknown) {
    console.error('Google login error:', err);
    const isTokenError = err instanceof Error && (
      err.message.includes('Token used too late') ||
      err.message.includes('Invalid token') ||
      err.message.includes('No pem found') ||
      err.message.includes('audience')
    );
    if (isTokenError) {
      return res.status(401).json({ error: 'Invalid Google token' });
    }
    res.status(500).json({ error: 'Google sign-in failed. Please try again.' });
  }
}
