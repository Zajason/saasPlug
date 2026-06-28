import { Request, Response } from 'express';
import prisma from '../prisma/client.ts';
import { z } from 'zod';

const PROFILE_SELECT = {
    id: true,
    email: true,
    firstName: true,
    lastName: true,
    phone: true,
    role: true,
    preferences: true,
    createdAt: true,
    updatedAt: true,
    // REMOVED outstandingBalanceEur and password!
} as const;

// ... keep your existing Address extraction helpers here ...

const profileUpdateSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  preferences: z.any().optional(),
});

function asPreferencesObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function extractAddress(preferences: unknown) {
  const prefs = asPreferencesObject(preferences);
  const address = asPreferencesObject(prefs.address);

  return {
    address: typeof address.address === "string" ? address.address : "",
    city: typeof address.city === "string" ? address.city : "",
    state: typeof address.state === "string" ? address.state : "",
    zipCode: typeof address.zipCode === "string" ? address.zipCode : "",
  };
}

function buildUpdatedPreferences(
  existingPreferences: unknown,
  incomingPreferences: unknown,
  addressFields: {
    address?: string;
    city?: string;
    state?: string;
    zipCode?: string;
  },
) {
  const base = {
    ...asPreferencesObject(existingPreferences),
    ...asPreferencesObject(incomingPreferences),
  };
  const currentAddress = extractAddress(existingPreferences);
  const nextAddress = {
    address: addressFields.address ?? currentAddress.address,
    city: addressFields.city ?? currentAddress.city,
    state: addressFields.state ?? currentAddress.state,
    zipCode: addressFields.zipCode ?? currentAddress.zipCode,
  };

  const hasAddressUpdate = Object.values(addressFields).some((value) => value !== undefined);
  if (hasAddressUpdate) {
    base.address = nextAddress;
  }

  return Object.keys(base).length > 0 ? base : undefined;
}

function formatUserProfileResponse(user: typeof PROFILE_SELECT extends infer _T ? any : never) {
  const address = extractAddress(user.preferences);

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    role: user.role,
    preferences: user.preferences,
    address: address.address,
    city: address.city,
    state: address.state,
    zipCode: address.zipCode,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export const getProfile = async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: PROFILE_SELECT,
    });
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(formatUserProfileResponse(user));
  } catch (e) {
    res.status(500).json({ error: "Internal Server Error" });
  }
};

export const updateProfile = async (req: Request, res: Response) => {
    const parsed = profileUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: z.treeifyError(parsed.error) });

    try {
        const existingUser = await prisma.user.findUnique({
            where: { id: req.userId },
            select: { preferences: true },
        });
        if (!existingUser) return res.status(404).json({ error: "User not found" });

        const { address, city, state, zipCode, preferences, ...basicFields } = parsed.data;
        const preferencesUpdate = buildUpdatedPreferences(
            existingUser.preferences,
            preferences,
            { address, city, state, zipCode }
        );

        const updateData: Record<string, unknown> = { ...basicFields };
        if (preferencesUpdate !== undefined) {
            updateData.preferences = preferencesUpdate;
        }

        const updatedUser = await prisma.user.update({
            where: { id: req.userId },
            data: updateData,
            select: PROFILE_SELECT,
        });
        res.json(formatUserProfileResponse(updatedUser));
    } catch (e) {
        res.status(500).json({ error: "Failed to update profile" });
    }
};
