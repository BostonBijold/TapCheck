import NextAuth from "next-auth";
import { MongoDBAdapter } from "@auth/mongodb-adapter";
import clientPromise from "@/lib/mongodb-client";
import { connectDB } from "@/lib/mongoose";
import User from "@/models/User";
import authConfig from "@/lib/auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: MongoDBAdapter(clientPromise),
  callbacks: {
    jwt({ token, user }) {
      console.log("[auth] jwt callback — user:", user?.id, "token sub:", token?.sub);
      if (user) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      console.log("[auth] session callback — token:", token?.id, "session:", session?.user?.email);
      if (token?.id) session.user.id = token.id as string;
      return session;
    },
  },
  events: {
    async signIn({ user, account, isNewUser }) {
      console.log("[auth] signIn event — user:", user?.email, "provider:", account?.provider, "isNewUser:", isNewUser);
    },
    async createUser({ user }) {
      console.log("[auth] createUser event — user:", user?.id, user?.email);
      await connectDB();
      // The adapter writes the new user doc directly via its own MongoDB
      // driver, bypassing Mongoose — schema defaults never apply to that
      // insert. Stamp role explicitly so it's visible (and hand-editable) in
      // MongoDB right away. companyId stays unset: v1 has no self-serve
      // company creation — a developer manually attaches a pre-created
      // Company doc by hand. Task list seeding now happens per-company (see
      // the Tasks page's first-visit seed check), not per-user at
      // signup, since there's no company to seed against yet.
      await User.updateOne({ _id: user.id }, { $set: { role: "manager" } });
    },
    async session({ session }) {
      console.log("[auth] session event — email:", session?.user?.email);
    },
  },
});
