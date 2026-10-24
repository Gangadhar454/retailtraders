import type { Metadata } from "next";

import { ProfileView } from "@/components/ProfileView";

export async function generateMetadata({
  params,
}: PageProps<"/u/[username]">): Promise<Metadata> {
  const { username } = await params;
  return {
    title: `@${username}`,
    description: `Daily P&L, verified performance metrics and peer-to-peer UPI tips for @${username} on NetPnL.`,
  };
}

export default async function ProfilePage({ params }: PageProps<"/u/[username]">) {
  const { username } = await params;
  return <ProfileView username={username} />;
}
