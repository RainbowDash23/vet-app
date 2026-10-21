import React from 'react';

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
  className?: string;
}

const defaultProps = {
  xmlns: 'http://www.w3.org/2000/svg',
  fill: 'none',
  viewBox: '0 0 24 24',
  strokeWidth: 1.5,
  stroke: 'currentColor',
};

export const ClinicIcon: React.FC<IconProps> = ({ size = 18, className, ...props }) => (
  <svg {...defaultProps} width={size} height={size} className={className} {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M6 3v18m12-18v18M9 6.75h6M9 9.75h6M9 12.75h6M9 15.75h6M10.5 21v-3.75h3V21" />
  </svg>
);

export const ClipboardIcon: React.FC<IconProps> = ({ size = 18, className, ...props }) => (
  <svg {...defaultProps} width={size} height={size} className={className} {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 3.75H6.75A2.25 2.25 0 004.5 6v13.5A2.25 2.25 0 006.75 21.75h10.5A2.25 2.25 0 0019.5 19.5V6a2.25 2.25 0 00-2.25-2.25H15M9 3.75a1.5 1.5 0 013 0m-3 0a1.5 1.5 0 003 0m-3.75 6h7.5m-7.5 3h7.5m-7.5 3h4.5" />
  </svg>
);

export const PetIcon: React.FC<IconProps> = ({ size = 18, className, ...props }) => (
  <svg {...defaultProps} width={size} height={size} className={className} {...props}>
    <circle cx="7" cy="8" r="2" />
    <circle cx="17" cy="8" r="2" />
    <circle cx="10" cy="4.5" r="1.5" />
    <circle cx="14" cy="4.5" r="1.5" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 11c-3 0-5 1.79-5 4 0 2 1.5 3.5 3 4.5 1 .67 3 .67 4 0 1.5-1 3-2.5 3-4.5 0-2.21-2-4-5-4z" />
  </svg>
);

export const TagIcon: React.FC<IconProps> = ({ size = 18, className, ...props }) => (
  <svg {...defaultProps} width={size} height={size} className={className} {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
  </svg>
);

export const CalendarIcon: React.FC<IconProps> = ({ size = 18, className, ...props }) => (
  <svg {...defaultProps} width={size} height={size} className={className} {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 7.5h18M4.5 4.5h15A1.5 1.5 0 0121 6v13.5A1.5 1.5 0 0119.5 21h-15A1.5 1.5 0 013 19.5V6a1.5 1.5 0 011.5-4.5z" />
  </svg>
);

export const StethoscopeIcon: React.FC<IconProps> = ({ size = 18, className, ...props }) => (
  <svg {...defaultProps} width={size} height={size} className={className} {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 4.5v5.25a6 6 0 0012 0V4.5m-12 0h2.25m9.75 0h2.25M10.5 15.75v3a2.25 2.25 0 002.25 2.25h1.5a2.25 2.25 0 002.25-2.25v-.75" />
    <circle cx="16.5" cy="18" r="1.5" />
  </svg>
);

export const SyringeIcon: React.FC<IconProps> = ({ size = 18, className, ...props }) => (
  <svg {...defaultProps} width={size} height={size} className={className} {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M18.75 5.25l-2.25-2.25m-1.5 3.75l2.25 2.25m-6 1.5l2.25 2.25m-9 9l4.5-4.5m-3-1.5l1.5-1.5m6-6l-9 9 3 3 9-9-3-3z" />
  </svg>
);

export const UsersIcon: React.FC<IconProps> = ({ size = 18, className, ...props }) => (
  <svg {...defaultProps} width={size} height={size} className={className} {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
  </svg>
);

export const UserIcon: React.FC<IconProps> = ({ size = 18, className, ...props }) => (
  <svg {...defaultProps} width={size} height={size} className={className} {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
  </svg>
);

export const ShieldIcon: React.FC<IconProps> = ({ size = 18, className, ...props }) => (
  <svg {...defaultProps} width={size} height={size} className={className} {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3s7.5 3 7.5 9c0 6-7.5 9-7.5 9S4.5 18 4.5 12c0-6 7.5-9 7.5-9z" />
  </svg>
);

export const LockIcon: React.FC<IconProps> = ({ size = 18, className, ...props }) => (
  <svg {...defaultProps} width={size} height={size} className={className} {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5A2.25 2.25 0 0019.5 19.5v-6.75A2.25 2.25 0 0017.25 10.5H6.75A2.25 2.25 0 004.5 12.75v6.75A2.25 2.25 0 006.75 21.75z" />
  </svg>
);

export const LogoutIcon: React.FC<IconProps> = ({ size = 18, className, ...props }) => (
  <svg {...defaultProps} width={size} height={size} className={className} {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
  </svg>
);

export const WarningIcon: React.FC<IconProps> = ({ size = 18, className, ...props }) => (
  <svg {...defaultProps} width={size} height={size} className={className} {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 18.75h.007v.008H12v-.008z" />
  </svg>
);

export const CheckIcon: React.FC<IconProps> = ({ size = 18, className, ...props }) => (
  <svg {...defaultProps} width={size} height={size} className={className} {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
  </svg>
);

export const CrossIcon: React.FC<IconProps> = ({ size = 18, className, ...props }) => (
  <svg {...defaultProps} width={size} height={size} className={className} {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

export const PlusIcon: React.FC<IconProps> = ({ size = 18, className, ...props }) => (
  <svg {...defaultProps} width={size} height={size} className={className} {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
  </svg>
);

export const SearchIcon: React.FC<IconProps> = ({ size = 18, className, ...props }) => (
  <svg {...defaultProps} width={size} height={size} className={className} {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
  </svg>
);

export const PhoneIcon: React.FC<IconProps> = ({ size = 18, className, ...props }) => (
  <svg {...defaultProps} width={size} height={size} className={className} {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
  </svg>
);

export const MailIcon: React.FC<IconProps> = ({ size = 18, className, ...props }) => (
  <svg {...defaultProps} width={size} height={size} className={className} {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
  </svg>
);

export const HomeIcon: React.FC<IconProps> = ({ size = 18, className, ...props }) => (
  <svg {...defaultProps} width={size} height={size} className={className} {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
  </svg>
);

export const IdCardIcon: React.FC<IconProps> = ({ size = 18, className, ...props }) => (
  <svg {...defaultProps} width={size} height={size} className={className} {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h14.25c.621 0 1.125.504 1.125 1.125v14.25c0 .621-.504 1.125-1.125 1.125H4.875c-.621 0-1.125-.504-1.125-1.125V4.875z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 9.75a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm0 7.5a4.5 4.5 0 00-4.5-4.5M13.5 9.75h4.5m-4.5 3h4.5m-4.5 3h2.25" />
  </svg>
);

export const RadioIcon: React.FC<IconProps> = ({ size = 18, className, ...props }) => (
  <svg {...defaultProps} width={size} height={size} className={className} {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.348 14.652a3.75 3.75 0 010-5.304m5.304 0a3.75 3.75 0 010 5.304m-7.425 2.121a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M12 12h.008v.008H12V12z" />
  </svg>
);

export const ChevronLeftIcon: React.FC<IconProps> = ({ size = 18, className, ...props }) => (
  <svg {...defaultProps} width={size} height={size} className={className} {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
  </svg>
);

export const ChevronRightIcon: React.FC<IconProps> = ({ size = 18, className, ...props }) => (
  <svg {...defaultProps} width={size} height={size} className={className} {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
  </svg>
);

export const ScaleIcon: React.FC<IconProps> = ({ size = 18, className, ...props }) => (
  <svg {...defaultProps} width={size} height={size} className={className} {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v18m-8-6l4-8 4 8H4zm12 0l4-8 4 8h-8z" />
  </svg>
);

export const ThermometerIcon: React.FC<IconProps> = ({ size = 18, className, ...props }) => (
  <svg {...defaultProps} width={size} height={size} className={className} {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 14.25v-8.5a2.25 2.25 0 00-4.5 0v8.5a4.5 4.5 0 104.5 0z" />
  </svg>
);

export const HeartIcon: React.FC<IconProps> = ({ size = 18, className, ...props }) => (
  <svg {...defaultProps} width={size} height={size} className={className} {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
  </svg>
);

export const LungsIcon: React.FC<IconProps> = ({ size = 18, className, ...props }) => (
  <svg {...defaultProps} width={size} height={size} className={className} {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v7m-6 3a4 4 0 014-4h2v8a4 4 0 01-6-4zm12 0a4 4 0 00-4-4h-2v8a4 4 0 006-4z" />
  </svg>
);

export const TimerIcon: React.FC<IconProps> = ({ size = 18, className, ...props }) => (
  <svg {...defaultProps} width={size} height={size} className={className} {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

export const DnaIcon: React.FC<IconProps> = ({ size = 18, className, ...props }) => (
  <svg {...defaultProps} width={size} height={size} className={className} {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 4c3 3 3 8 7 8s4 5 7 8M19 4c-3 3-3 8-7 8s-4 5-7 8m1-15h12m-10 5h8m-8 6h8m-10 5h12" />
  </svg>
);

export const GenderIcon: React.FC<IconProps> = ({ size = 18, className, ...props }) => (
  <svg {...defaultProps} width={size} height={size} className={className} {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M10 14a5 5 0 100-10 5 5 0 000 10zm0 0v7m-3-3h6m8-14h-5m5 0v5m0-5l-5 5" />
  </svg>
);

export const PaletteIcon: React.FC<IconProps> = ({ size = 18, className, ...props }) => (
  <svg {...defaultProps} width={size} height={size} className={className} {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.14 6.344a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" />
  </svg>
);
