import { NextFunction, Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import {
  createUser,
  getUserByEmail,
  getUserById,
  getUserByUserName,
} from '../models/users';
import { random, authentication } from '../helpers';

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.sendStatus(400);
    }

    const user = await getUserByEmail(email).select(
      '+authentication.salt +authentication.password'
    );

    if (!user) {
      return res.sendStatus(400);
    }

    const expectedHash = authentication(user.authentication!.salt!, password);

    if (user.authentication!.password != expectedHash) {
      return res.sendStatus(403);
    }

    const salt = random();
    user.authentication!.sessionToken = authentication(
      salt,
      user._id.toString()
    );

    await user.save();

    res.cookie('CookieFamiGO', user.authentication!.sessionToken, {
      domain: 'localhost',
      path: '/',
      httpOnly: true,
    });

    res.cookie('username', user.username, {
      domain: 'localhost',
      path: '/',
      httpOnly: true,
    });

    return res.status(200).json(user).end();
  } catch (error) {
    return res.status(400);
  }
};

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export const googleLogin = async (req: Request, res: Response) => {
  try {
    console.log('Google login request received');
    const { token } = req.body;
    console.log('Token received:', token);
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    console.log('Token verified');

    const payload = ticket.getPayload();

    if (!payload) {
      return res.status(400).json({ message: 'Invalid token' });
    }

    console.log('Checking user in database', payload.email);
    let user = await getUserByEmail(payload.email as string);
    console.log('User from database', user);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const newSessionToken = authentication(
      user.authentication!.salt!,
      user._id.toString()
    );
    user.authentication!.sessionToken = newSessionToken;
    await user.save();

    return res.status(200).json({ user: user, token: newSessionToken });
  } catch (error) {
    console.error('Error in googleLogin:', error);
    return res.status(400);
  }
};

export const register = async (req: Request, res: Response) => {
  try {
    const { email, password, username } = req.body;

    if (!email || !password || !username) {
      return res.sendStatus(400);
    }

    const existingUserEmail = await getUserByEmail(email);
    const existingUserName = await getUserByUserName(username);

    if (existingUserEmail || existingUserName) {
      return res.sendStatus(400);
    }

    const salt = random();
    const user = await createUser({
      email,
      username,
      authentication: {
        salt,
        password: authentication(salt, password),
      },
    });

    return res.status(200).json(user).end();
  } catch (error) {
    return res.sendStatus(400);
  }
};

export const updateUsername = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { username } = req.body;
    if (!username) {
      return res.sendStatus(400);
    }
    const user = await getUserById(id);
    user!.username = username;
    await user!.save();
    return res.status(200).json(user).end();
  } catch (error) {
    return res.sendStatus(400);
  }
};

export const updatePassword = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { password } = req.body;

    if (!id || !password) {
      return res.sendStatus(400);
    }

    const user = await getUserById(id);

    if (!user) {
      return res.sendStatus(404);
    }

    const newSalt = random();
    const hashedPassword = authentication(newSalt, password);

    user.authentication!.salt = newSalt;
    user.authentication!.password = hashedPassword;

    await user.save();

    return res.status(200);
  } catch (error) {
    return res.sendStatus(400);
  }
};

export const updateUserAvatar = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { avatar } = req.body;

    const user = await getUserById(id);

    user!.avatar = avatar;
    await user!.save();

    return res.status(200).json(user).end();
  } catch (error) {
    return res.sendStatus(400);
  }
};

export const getUserInfo = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const username = req.params.id;

    const user = await getUserByUserName(username);

    res.locals.user = user;
    next();
    return;
  } catch (error) {
    console.error(error);
    return res.sendStatus(400);
  }
};
