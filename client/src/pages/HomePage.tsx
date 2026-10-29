import Navbar from '@/components/layout/Navbar'
import Footer from '@/components/layout/Footer'
import HeroSection from '@/components/home/HeroSection'
import HowItWorks from '@/components/home/HowItWorks'
import CTASection from '@/components/home/CTASection'

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#050913' }}>
      <Navbar />
      <main className="flex-1">
        <HeroSection />
        <HowItWorks />
        <CTASection />
      </main>
      <Footer />
    </div>
  )
}
