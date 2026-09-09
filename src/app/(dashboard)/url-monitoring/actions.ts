"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireCompanyFeature } from "@/lib/rbac";
import { logAdminAction } from "@/lib/audit";
import { discoverAndScanSite, rescanSite as rescanSiteScans, deriveDomain } from "@/lib/url-monitor";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";

async function requireOwnedSite(siteId: string, companyId: string) {
  const site = await prisma.monitoredSite.findFirst({ where: { id: siteId, companyId } });
  if (!site) throw new Error("Site does not belong to your company");
  return site;
}

function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return new URL(withScheme).toString();
}

export async function createSite(input: { url: string }) {
  const { companyId, email } = await requireAdmin();
  await requireCompanyFeature(companyId, "url_monitoring");

  let url: string;
  try {
    url = normalizeUrl(input.url);
  } catch {
    throw new Error("Enter a valid URL");
  }

  let site;
  try {
    site = await prisma.monitoredSite.create({
      data: { companyId, url, domain: deriveDomain(url) },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new Error("This site is already monitored");
    }
    throw err;
  }

  await logAdminAction({ companyId, actorEmail: email, action: "url_site.create", detail: `url=${url}` });

  let warning: string | undefined;
  try {
    await discoverAndScanSite(site.id, url);
  } catch (err) {
    warning = err instanceof Error ? err.message : "Initial scan failed";
  }

  revalidatePath("/url-monitoring");
  return { siteId: site.id, warning };
}

export async function rescanSite(siteId: string) {
  const { companyId, email } = await requireAdmin();
  const site = await requireOwnedSite(siteId, companyId);
  await rescanSiteScans(siteId, site.url);
  await logAdminAction({ companyId, actorEmail: email, action: "url_site.rescan", detail: `url=${site.url}` });
  revalidatePath("/url-monitoring");
}

export async function discoverEndpoints(siteId: string) {
  const { companyId, email } = await requireAdmin();
  const site = await requireOwnedSite(siteId, companyId);
  const result = await discoverAndScanSite(siteId, site.url);
  await logAdminAction({ companyId, actorEmail: email, action: "url_site.discover_endpoints", detail: `linksFound=${result.linksFound}` });
  revalidatePath("/url-monitoring");
  return result;
}

export async function deleteSite(siteId: string) {
  const { companyId, email } = await requireAdmin();
  const site = await requireOwnedSite(siteId, companyId);
  await prisma.monitoredSite.delete({ where: { id: siteId } });
  await logAdminAction({ companyId, actorEmail: email, action: "url_site.delete", detail: `url=${site.url}` });
  revalidatePath("/url-monitoring");
}

export async function deleteEndpoint(endpointId: string) {
  const { companyId, email } = await requireAdmin();
  const endpoint = await prisma.monitoredEndpoint.findFirst({
    where: { id: endpointId, site: { companyId } },
    include: { site: true },
  });
  if (!endpoint) throw new Error("Endpoint does not belong to your company");
  await prisma.monitoredEndpoint.delete({ where: { id: endpointId } });
  await logAdminAction({ companyId, actorEmail: email, action: "url_endpoint.delete", detail: `url=${endpoint.url}` });
  revalidatePath("/url-monitoring");
}

export async function listScanResults(params: { siteId?: string; endpointId?: string; page?: number }) {
  const { companyId } = await requireAdmin();
  const page = params.page && params.page > 0 ? params.page : 1;

  let siteId = params.siteId;
  if (siteId) {
    const owned = await prisma.monitoredSite.findFirst({ where: { id: siteId, companyId } });
    if (!owned) siteId = "__none__";
  }

  const where = {
    site: { companyId },
    ...(siteId ? { siteId } : {}),
    ...(params.endpointId ? { endpointId: params.endpointId } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.siteScanResult.findMany({
      where,
      orderBy: { scannedAt: "desc" },
      skip: (page - 1) * DEFAULT_PAGE_SIZE,
      take: DEFAULT_PAGE_SIZE,
      include: { endpoint: { select: { url: true, path: true } } },
    }),
    prisma.siteScanResult.count({ where }),
  ]);

  return { rows, total, page, pageSize: DEFAULT_PAGE_SIZE };
}
