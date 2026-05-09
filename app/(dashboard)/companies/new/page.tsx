import Link from "next/link";

import { CompanyForm } from "@/components/companies/CompanyForm";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function NewCompanyPage() {
  return (
    <>
      <PageHeader
        eyebrow={<Link href="/companies" className="hover:underline">Organizations</Link>}
        title="New organization"
        description="You will be added as the owner. Invite teammates after creation."
        actions={
          <Button variant="outline" asChild>
            <Link href="/companies">Cancel</Link>
          </Button>
        }
      />
      <div className="mx-auto w-full max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Organization details</CardTitle>
            <CardDescription>Required fields are marked.</CardDescription>
          </CardHeader>
          <CardContent>
            <CompanyForm />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
