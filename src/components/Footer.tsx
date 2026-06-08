import React from 'react';
import type { BusinessSettings } from '../types/settings';

interface FooterProps {
  settings: BusinessSettings | null;
}

export const Footer: React.FC<FooterProps> = ({ settings }) => {
  const currentYear = new Date().getFullYear();
  const name = settings?.name || 'Dualgi 3D';
  const desc = settings?.description || 'Materializando tus ideas en 3D';

  const formatWhatsappLink = (num: string) => {
    // Strip non-digits
    const cleanNum = num.replace(/\D/g, '');
    return `https://wa.me/${cleanNum}`;
  };

  return (
    <footer className="bg-slate-900 text-slate-400 border-t border-slate-800 py-5 mt-auto text-xs">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Left side: Brand & description */}
        <div className="flex flex-col sm:flex-row items-center gap-3 text-center sm:text-left">
          <div className="flex items-center gap-2">
            {settings?.logoUrl ? (
              <img src={settings.logoUrl} alt={name} className="h-6 w-auto object-contain bg-white/10 p-0.5 rounded" />
            ) : (
              <span className="font-bold text-white tracking-wider bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">{name}</span>
            )}
          </div>
          <span className="text-slate-600 hidden sm:inline">|</span>
          <p className="text-slate-500">{desc}</p>
        </div>

        {/* Center: Social Icons */}
        <div className="flex items-center gap-3">
          {settings?.instagram && (
            <a
              href={`https://instagram.com/${settings.instagram.replace('@', '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-gradient-to-tr hover:from-amber-500 hover:to-purple-600 text-white flex items-center justify-center transition-all duration-300 transform hover:-translate-y-0.5 shadow"
              title="Instagram"
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.051.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
              </svg>
            </a>
          )}
          {settings?.tiktok && (
            <a
              href={`https://tiktok.com/@${settings.tiktok.replace('@', '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center transition-all duration-300 transform hover:-translate-y-0.5 shadow"
              title="TikTok"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#00f2fe" d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.17-2.86-.74-3.99-1.72-.08-.07-.17-.17-.25-.26V14c.02 2.78-1.56 5.48-4.17 6.48-2.61 1-5.74.45-7.79-1.51-2.05-1.95-2.64-5.07-1.45-7.7 1.19-2.62 4.22-4.22 7.09-3.86v4.16c-1.39-.21-2.88.22-3.77 1.29-.89 1.07-1.09 2.63-.49 3.84.6 1.2 2.05 1.94 3.39 1.7 1.34-.24 2.39-1.39 2.51-2.73.08-1.07.03-2.14.04-3.21V0h.03z" transform="translate(-0.5, -0.5)" />
                <path fill="#fe0979" d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.17-2.86-.74-3.99-1.72-.08-.07-.17-.17-.25-.26V14c.02 2.78-1.56 5.48-4.17 6.48-2.61 1-5.74.45-7.79-1.51-2.05-1.95-2.64-5.07-1.45-7.7 1.19-2.62 4.22-4.22 7.09-3.86v4.16c-1.39-.21-2.88.22-3.77 1.29-.89 1.07-1.09 2.63-.49 3.84.6 1.2 2.05 1.94 3.39 1.7 1.34-.24 2.39-1.39 2.51-2.73.08-1.07.03-2.14.04-3.21V0h.03z" transform="translate(0.5, 0.5)" />
                <path fill="#ffffff" d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.17-2.86-.74-3.99-1.72-.08-.07-.17-.17-.25-.26V14c.02 2.78-1.56 5.48-4.17 6.48-2.61 1-5.74.45-7.79-1.51-2.05-1.95-2.64-5.07-1.45-7.7 1.19-2.62 4.22-4.22 7.09-3.86v4.16c-1.39-.21-2.88.22-3.77 1.29-.89 1.07-1.09 2.63-.49 3.84.6 1.2 2.05 1.94 3.39 1.7 1.34-.24 2.39-1.39 2.51-2.73.08-1.07.03-2.14.04-3.21V0h.03z" />
              </svg>
            </a>
          )}
          {settings?.whatsapp && (
            <a
              href={formatWhatsappLink(settings.whatsapp)}
              target="_blank"
              rel="noopener noreferrer"
              className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center transition-all duration-300 transform hover:-translate-y-0.5 shadow"
              title="WhatsApp"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#25D366" d="M12.004 0C5.372 0 0 5.372 0 12.004c0 2.116.55 4.103 1.597 5.845L.057 24l6.303-1.654a11.95 11.95 0 005.644 1.412c6.633 0 12.004-5.371 12.004-12.004C24.008 5.372 18.637 0 12.004 0zm6.59 17.067c-.27.76-1.562 1.394-2.148 1.48-.544.077-1.25.143-3.73-.884-3.175-1.314-5.214-4.542-5.372-4.753-.16-.211-1.292-1.72-1.292-3.284 0-1.564.82-2.33 1.114-2.637.293-.308.64-.385.854-.385.213 0 .426.002.612.01.2.007.47-.075.735.56.27.653.924 2.253 1.004 2.417.08.163.134.354.027.566-.107.212-.16.345-.32.531-.16.186-.336.415-.48.56-.164.164-.335.343-.144.67.19.327.848 1.4 1.82 2.268.973.867 1.79 1.137 2.11 1.297.32.16.507.133.694-.084.186-.217.8-.933.101-1.21-.106-.277-.694-.564-.854-.644-.16-.08-.267-.066-.373.08-.107.147-.453.565-.56.673-.106.108-.213.12-.426.013-.213-.107-.902-.333-1.72-1.06-.635-.567-1.064-1.267-1.19-1.48-.126-.213-.013-.328.093-.434.097-.095.214-.25.32-.375.107-.126.142-.213.213-.355.07-.142.036-.266-.018-.372-.054-.107-.47-1.135-.644-1.55-.17-.408-.344-.352-.472-.358-.118-.006-.254-.007-.39-.007-.533 0-1.397.2-1.996.84-.6.64-2.285 2.233-2.285 5.447 0 3.214 2.337 6.324 2.657 6.75.32.427 4.6 7.024 11.144 9.852 1.557.673 2.772 1.074 3.72 1.376 1.564.496 2.986.427 4.11.259 1.252-.187 2.85-.924 3.25-1.814z" />
                <path fill="#FFF" d="M12.004 2.116c-5.46 0-9.888 4.428-9.888 9.888 0 1.751.455 3.4 1.318 4.84L2.13 21.87l5.163-1.354c1.397.763 2.99 1.194 4.71 1.194 5.46 0 9.888-4.428 9.888-9.888s-4.428-9.888-9.888-9.888zm5.955 12.304c-.385.857-1.936 1.554-2.617 1.66-.66.106-1.52.196-4.524-1.1-3.85-1.656-6.326-5.715-6.518-5.98-.192-.266-1.567-2.17-1.567-4.14 0-1.97 1-2.935 1.357-3.322.357-.388.778-.485 1.038-.485.26 0 .518.003.743.013.243.01.57-.095.892.705.328.82 1.122 2.843 1.22 3.05.097.206.162.446.032.715-.13.268-.195.435-.389.67-.195.234-.407.522-.582.705-.2.206-.407.432-.175.844.23.412 1.028 1.763 2.207 2.86 1.18 1.095 2.17 1.436 2.558 1.637.389.202.615.167.842-.106.226-.273.97-1.176 1.23-1.523.258-.348.517-.29.852-.165.336.126 2.135 1.09 2.505 1.282.37.19.617.284.707.443.09.158.09.913-.295 1.77z" />
              </svg>
            </a>
          )}
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 text-slate-500 text-center sm:text-right">
          <span>© {currentYear} {name}. Todos los derechos reservados.</span>
        </div>
      </div>
    </footer>
  );
};
