import styles from "./home.module.css";
import { Hero } from "./_sections/Hero";
import { AboutSection } from "./_sections/AboutSection";
import { ProjectsSection } from "./_sections/ProjectsSection";
import { ActivitiesSection } from "./_sections/ActivitiesSection";
import { JoinSection } from "./_sections/JoinSection";
import { Footer } from "./_sections/Footer";

export default function Home() {
  return (
    <main className={styles.home}>
      <Hero />
      <AboutSection />
      <ProjectsSection />
      <ActivitiesSection />
      <JoinSection />
      <Footer />
    </main>
  );
}
