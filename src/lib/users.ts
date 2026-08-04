import "server-only";
import { prisma } from "@/lib/prisma";
import { MILL_CODES, type MillCode } from "@/lib/access";

export type UserSummary = {
  id: string;
  fullName: string;
  username: string;
  homeMill: string;
  adminAccess: boolean;
  mills: MillCode[];
};

export async function getAllUsers(): Promise<UserSummary[]> {
  const users = await prisma.user.findMany({ orderBy: { fullName: "asc" } });

  return users.map((user) => ({
    id: user.id,
    fullName: user.fullName,
    username: user.username,
    homeMill: user.homeMill,
    adminAccess: user.adminAccess,
    mills: MILL_CODES.filter((code) => {
      switch (code) {
        case "TRL":
          return user.trlAccess;
        case "SRM":
          return user.srmAccess;
        case "SLI":
          return user.sliAccess;
        case "NFL":
          return user.nflAccess;
        case "STLC":
          return user.stlcAccess;
        case "GL":
          return user.glAccess;
      }
    }),
  }));
}

export async function usernameExists(username: string): Promise<boolean> {
  const user = await prisma.user.findFirst({ where: { username }, select: { id: true } });
  return user !== null;
}
