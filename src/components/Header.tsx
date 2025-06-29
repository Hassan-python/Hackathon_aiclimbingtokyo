import { Mountain } from 'lucide-react';
import LanguageSwitcher from './LanguageSwitcher';

const Header = () => {
  // === ハッカソンマーク表示機能 START ===
  const SHOW_HACKATHON_MARK: boolean = true; // ハッカソン終了後は false に変更
  // === ハッカソンマーク表示機能 END ===
  return (
    <header className="relative overflow-hidden bg-gray-900 py-8 shadow-lg">
      {/* Decorative background pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }} />
      </div>

      <div className="container relative mx-auto px-4">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-emerald-500/10 p-2">
                <Mountain size={28} className="text-emerald-500" />
              </div>
              <h1 className="bg-gradient-to-r from-emerald-400 to-emerald-600 bg-clip-text text-2xl font-bold text-transparent">
                AI Climbing Tokyo
              </h1>
            </div>
            <p className="ml-10 mt-2 text-sm text-emerald-400/80">
              Powered by Japanese climbers. Upload your fall — get Gen-AI feedback inspired by Japan's top pros.
            </p>
          </div>
          {/* === ハッカソンマーク表示機能: LanguageSwitcher をラップ START === */}
          <div className="flex flex-col items-center">
            {SHOW_HACKATHON_MARK && (
              <div className="mb-2">
                <img
                  src="/hackathon-mark.png"
                  alt="Hackathon Mark"
                  className="h-16 w-16 md:h-20 md:w-20 lg:h-24 lg:w-24 object-contain rounded-full"
                  onError={(e) => {
                    console.warn("Hackathon mark image failed to load");
                    e.currentTarget.style.display = "none";
                  }}
                />
              </div>
            )}
            <LanguageSwitcher />
          </div>
          {/* === ハッカソンマーク表示機能: LanguageSwitcher をラップ END === */}
        </div>
      </div>

      {/* Decorative bottom border */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500/0 via-emerald-500/50 to-emerald-500/0"></div>
    </header>
  );
};

export default Header;