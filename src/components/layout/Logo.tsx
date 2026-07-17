import logoLight from '@/assets/logo-light.svg';
import logoDark from '@/assets/logo-dark.svg';

interface LogoProps {
  className?: string;
  alt?: string;
}

export function Logo({ className = 'h-20 w-20', alt = 'Repply' }: LogoProps) {
  return (
    <>
      <img
        src={logoLight}
        alt={alt}
        className={`object-contain dark:hidden ${className}`}
      />
      <img
        src={logoDark}
        alt={alt}
        className={`object-contain hidden dark:block ${className}`}
      />
    </>
  );
}
