import { LearningInbox } from "@/components/learning-inbox";

export default function HomePage() {
  if (process.env.NODE_ENV === "production") {
    return (
      <main className="processor-landing">
        <div className="processor-mark" aria-hidden="true">C</div>
        <p className="processor-eyebrow">CURIO PERSONAL BETA</p>
        <h1>The processor is online.</h1>
        <p>Open the Curio mobile app to save, research, and organize a discovery.</p>
        <a href="/api/health">View service health</a>
      </main>
    );
  }
  return <LearningInbox />;
}
