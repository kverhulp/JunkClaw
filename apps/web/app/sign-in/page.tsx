import { AuthForm } from "../../components/auth/auth-form";
import { SiteFooter, SiteHeader } from "../../components/layout/site-chrome";

export const metadata = { title: "Sign in — AutoScout" };

export default function SignInPage() {
  return (
    <>
      <SiteHeader />
      <AuthForm mode="sign-in" />
      <SiteFooter />
    </>
  );
}
