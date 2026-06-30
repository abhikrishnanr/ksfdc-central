export const dynamic = 'force-dynamic';

import DocumentationPortal from '../../../components/documentation/DocumentationPortal';
import { requireCentralRole } from '../../../lib/auth';
import { technicalManual } from '../../../lib/documentation/version-2';

export default async function TechnicalDocumentationPage() {
  await requireCentralRole(['SUPER_ADMIN']);

  return <DocumentationPortal manual={technicalManual} />;
}
