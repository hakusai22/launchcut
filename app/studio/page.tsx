import { VideoConsole } from "@/components/VideoConsole";
import { defaultVideoSpec } from "@/lib/video-spec";

type StudioPageProps = {
  searchParams: Promise<{ generate?: string }>;
};

export default async function StudioPage({ searchParams }: StudioPageProps) {
  const params = await searchParams;

  return <VideoConsole initialSpec={defaultVideoSpec} mode="studio" autoGenerate={params.generate === "1"} />;
}
