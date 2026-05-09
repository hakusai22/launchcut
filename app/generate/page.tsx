import { VideoConsole } from "@/components/VideoConsole";
import { defaultVideoSpec } from "@/lib/video-spec";

export default function GeneratePage() {
  return <VideoConsole initialSpec={defaultVideoSpec} mode="home" />;
}
