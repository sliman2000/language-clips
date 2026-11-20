import { defineEveryApp } from "@every-app/sdk";

export default defineEveryApp({
  id: "language-clips",
  name: "Language Clips",
  description:
    "Learn English and Korean phrases from short subtitled clips, then practice them in quizzes.",
  icon: "/icon.svg",
  resources: {
    d1: ["DB"],
    r2: ["clips"],
  },
});
