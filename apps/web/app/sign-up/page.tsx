import { AuthForm } from "../../components/auth/auth-form";
import { SiteFooter, SiteHeader } from "../../components/layout/site-chrome";

export const metadata = { title: "Create an account — AutoScout" };

export default function SignUpPage() {
  return (
    <>
      <SiteHeader />
      <AuthForm mode="sign-up" />
      <SiteFooter />
    </>
  );
}
