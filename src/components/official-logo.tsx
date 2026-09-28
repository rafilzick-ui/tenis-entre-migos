import type { ImgHTMLAttributes } from "react";

export function OfficialLogo({ className, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  return <img src="/logo_tenis_entre_amigos.png" alt="Tênis Entre Amigos" className={className} {...props} />;
}
