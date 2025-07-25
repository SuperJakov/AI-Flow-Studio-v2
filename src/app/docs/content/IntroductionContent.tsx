"use client";

import Link from "next/link";
import { Separator } from "~/components/ui/separator";

export default function IntroductionContent() {
  return (
    <section id="introduction" className="bg-background mb-16 scroll-mt-16">
      <h2 className="mb-4 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-2xl font-bold text-transparent">
        Introduction
      </h2>
      <div>
        <p className="mb-5">Welcome to AI Flow Studio documentation!</p>
        <p className="mb-4">
          This section will help you understand what{" "}
          <Link href="/">
            <span className="bg-gradient-to-r from-blue-400 via-purple-500 to-pink-500 bg-clip-text font-bold text-transparent">
              AI Flow Studio
            </span>
          </Link>{" "}
          does and how it benefits you.
        </p>
        <Separator />
        <p className="pt-6">
          AI Flow Studio was made to simplify the process of building AI
          applications.
        </p>
        <p>It helps people:</p>
        <ul className="list-disc space-y-2 pt-4 pl-5">
          <li>
            <span className="font-bold">
              Build Complex Ideas from Simple Parts:
            </span>{" "}
            Users can mix and match different text nodes to see what happens,
            making experimentation fast and fun.
          </li>
          <li>
            <span className="font-bold">Visualize the AI Process:</span> The
            lines connecting nodes aren&apos;t just for the show. They help the
            mind think how AI models are connected
          </li>
          <li>
            <span className="font-bold">Iterate and Experiment Rapidly:</span>{" "}
            Want to change the dog to a cat? Just edit that one node and rerun
            it. Want to add a &quot;wearing a pirate hat&quot; node? Drag it on,
            connect it, and go. This is much faster than editing a 50-word text
            prompt.
          </li>
        </ul>
        <p className="pt-8 pb-4">
          We prioritize user experience above all else, with an intuitive
          interface that makes working with AI accessible to everyone. Our app
          features a clean, modern design with drag-and-drop functionality, high
          quality outputs, and helpful tooltips to guide you through each step
          of the process.
        </p>
      </div>
    </section>
  );
}
