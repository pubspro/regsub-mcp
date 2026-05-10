import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import http from "http";
import crypto from "node:crypto";
// ─── ICH Guideline data ────────────────────────────────────────────────────

const ICH_GUIDELINES: Record<string, { title: string; scope: string; keyRequirements: string[]; url: string }> = {
    "E6(R3)": {
          title: "Good Clinical Practice (GCP)",
          scope: "Standards for design, conduct, performance, monitoring, auditing, recording, analysis, and reporting of clinical trials",
          keyRequirements: [
                  "Protocol must be approved by IRB/IEC before study initiation",
                  "Informed consent must be obtained before any study procedures",
                  "All adverse events must be recorded and reported per protocol",
                  "Investigational product accountability must be maintained",
                  "Essential documents must be retained for minimum 15 years",
                  "Risk-based monitoring approach should be implemented"
                ],
          url: "https://www.ich.org/page/efficacy-guidelines#6"
    },
    "E8(R1)": {
          title: "General Considerations for Clinical Studies",
          scope: "Framework for planning and designing clinical studies throughout drug development",
          keyRequirements: [
                  "Quality-by-design approach for clinical studies",
                  "Factors critical to quality (FCQs) must be identified",
                  "Study design should minimise unnecessary complexity",
                  "Estimands framework should be applied",
                  "Stakeholder engagement including patients recommended"
                ],
          url: "https://www.ich.org/page/efficacy-guidelines#8"
    },
    "M4(R4)": {
          title: "Common Technical Document (CTD) Organisation",
          scope: "Harmonised structure for regulatory submissions (NDA/BLA/MAA) — the CTD format",
          keyRequirements: [
                  "Module 1: Regional administrative information",
                  "Module 2: Summaries (QOS, NCA, CTA, NCS, COS)",
                  "Module 3: Quality (pharmaceutical/CMC documentation)",
                  "Module 4: Nonclinical study reports",
                  "Module 5: Clinical study reports",
                  "eCTD format required by FDA, EMA, PMDA"
                ],
          url: "https://www.ich.org/page/multidisciplinary-guidelines#4"
    },
    "M7(R2)": {
          title: "Assessment and Control of DNA Reactive Mutagenic Impurities",
          scope: "Limits for mutagenic impurities in drug substances and products",
          keyRequirements: [
                  "TTC (Threshold of Toxicological Concern) approach: 1.5 microg/day default",
                  "Class 1-5 classification system for mutagenic impurities",
                  "QSAR analysis required for structural alert assessment",
                  "Acceptable intakes must be calculated based on treatment duration",
                  "ICH M7 control strategy must be documented in Module 3"
                ],
          url: "https://www.ich.org/page/multidisciplinary-guidelines#7"
    },
    "M9": {
          title: "Biopharmaceutics Classification System (BCS) Based Biowaiver",
          scope: "Conditions under which in vivo bioequivalence studies may be waived",
          keyRequirements: [
                  "BCS Class I and III drugs may qualify for biowaiver",
                  "High solubility: dose soluble in 250 mL at pH 1.2, 4.5, 6.8",
                  "High permeability: 85% or more absorbed in humans",
                  "Rapid dissolution: 85% or more dissolved in 30 minutes",
        "Must not have narrow therapeutic index"
                ],
          url: "https://www.ich.org/page/multidisciplinary-guidelines#9"
    },
    "S1B(R1)": {
          title: "Carcinogenicity Testing of Pharmaceuticals",
          scope: "When and how to conduct carcinogenicity studies",
          keyRequirements: [
                  "Required for drugs intended for continuous use more than 6 months",
                  "Two-year rat study standard; transgenic mouse model acceptable alternative",
                  "ICH S1C(R2) provides guidance on dose selection",
                  "Weight-of-evidence approach may reduce study requirements",
                  "Genotoxic carcinogens: address via ICH M7"
                ],
          url: "https://www.ich.org/page/safety-guidelines#1"
    },
    "Q1A(R2)": {
          title: "Stability Testing of New Drug Substances and Products",
          scope: "Core stability testing requirements for registration",
          keyRequirements: [
                  "Long-term: 25C/60%RH for 12 months minimum at submission",
                  "Accelerated: 40C/75%RH for 6 months",
                  "Intermediate: 30C/65%RH if accelerated shows significant change",
                  "Photostability per ICH Q1B required",
                  "Shelf life based on real-time data; extrapolation limited to 1.5x available data"
                ],
          url: "https://www.ich.org/page/quality-guidelines#1"
    },
    "Q3D(R2)": {
          title: "Elemental Impurities",
          scope: "Permitted daily exposures (PDEs) for elemental impurities in drug products",
          keyRequirements: [
                  "Class 1 (As, Cd, Hg, Pb): lowest PDEs, most stringent controls",
                  "Class 2A: oral, parenteral, and inhalation route-specific PDEs",
                  "Class 2B: route-specific, assess if intentionally added",
                  "Class 3: no PDEs established; low risk",
                  "Risk assessment required; controls in Module 3.2.P.5.6"
                ],
          url: "https://www.ich.org/page/quality-guidelines#3"
    }
};

// ─── CTD Module Mapping ───────────────────────────────────────────────────

const CTD_MODULES: Record<string, { title: string; sections: Record<string, string>; submissionType: string[] }> = {
    "1": {
          title: "Regional Administrative Information",
          sections: {
                  "1.1": "Comprehensive Table of Contents",
                  "1.2": "Application Forms",
                  "1.3": "Product Information (PI / SmPC / Package Insert)",
                  "1.4": "Information about the Experts",
                  "1.5": "Specific Requirements for Different Types of Applications",
                  "1.6": "Environmental Risk Assessment",
                  "1.7": "Information relating to Pharmacovigilance",
                  "1.8": "Information relating to Clinical Trials (EudraCT)",
                  "1.9": "Information relating to Paediatrics",
                  "1.10": "Information about Pharmacovigilance System",
                  "1.11": "Summary of the Risk Management System"
          },
          submissionType: ["NDA", "BLA", "MAA", "JNDA"]
    },
    "2": {
          title: "Common Technical Document Summaries",
          sections: {
                  "2.1": "CTD Table of Contents",
                  "2.2": "CTD Introduction",
                  "2.3": "Quality Overall Summary (QOS)",
                  "2.4": "Nonclinical Overview",
                  "2.5": "Clinical Overview",
                  "2.6": "Nonclinical Written and Tabulated Summaries",
                  "2.7": "Clinical Summary"
          },
          submissionType: ["NDA", "BLA", "MAA", "JNDA"]
    },
    "3": {
          title: "Quality",
          sections: {
                  "3.1": "Table of Contents of Module 3",
                  "3.2.S": "Drug Substance (API)",
                  "3.2.S.1": "General Information (nomenclature, structure, properties)",
                  "3.2.S.2": "Manufacture (manufacturer, process, controls, validation)",
                  "3.2.S.3": "Characterisation (structure elucidation, impurities)",
                  "3.2.S.4": "Control of Drug Substance (specifications, methods, validation)",
                  "3.2.S.5": "Reference Standards or Materials",
                  "3.2.S.6": "Container Closure System",
                  "3.2.S.7": "Stability",
                  "3.2.P": "Drug Product (Finished Product)",
                  "3.2.P.1": "Description and Composition",
                  "3.2.P.2": "Pharmaceutical Development",
                  "3.2.P.3": "Manufacture",
                  "3.2.P.4": "Control of Excipients",
                  "3.2.P.5": "Control of Drug Product (specifications, methods, validation)",
                  "3.2.P.6": "Reference Standards or Materials",
                  "3.2.P.7": "Container Closure System",
                  "3.2.P.8": "Stability",
                  "3.2.A": "Appendices",
                  "3.2.R": "Regional Information"
          },
          submissionType: ["NDA", "BLA", "MAA", "JNDA"]
    },
    "4": {
          title: "Nonclinical Study Reports",
          sections: {
                  "4.1": "Table of Contents",
                  "4.2.1": "Pharmacology (primary, secondary, safety pharmacology)",
                  "4.2.2": "Pharmacokinetics (absorption, distribution, metabolism, excretion)",
                  "4.2.3": "Toxicology (single/repeat dose, genotoxicity, carcinogenicity, reproductive)"
          },
          submissionType: ["NDA", "BLA", "MAA", "JNDA"]
    },
    "5": {
          title: "Clinical Study Reports",
          sections: {
                  "5.1": "Table of Contents",
                  "5.2": "Tabular Listing of All Clinical Studies",
                  "5.3.1": "Reports of Biopharmaceutic Studies",
                  "5.3.2": "Reports of Studies Pertinent to Pharmacokinetics",
                  "5.3.3": "Reports of Human PK Studies",
                  "5.3.4": "Reports of Human PD Studies",
                  "5.3.5": "Reports of Efficacy and Safety Studies",
                  "5.3.6": "Reports of Post-marketing Experience",
                  "5.3.7": "Case Report Forms and Individual Patient Listings"
          },
          submissionType: ["NDA", "BLA", "MAA", "JNDA"]
    }
};

// ─── FDA/EMA Common Deficiencies ─────────────────────────────────────────

const AGENCY_DEFICIENCIES: Record<string, Record<string, string[]>> = {
    FDA: {
          CMC: [
                  "Insufficient process validation data — commercial-scale validation batches required",
                  "Missing or inadequate method validation reports per USP 1225",
                  "Stability data gap — insufficient real-time data to support proposed shelf life",
                  "Impurity qualification threshold not met — genotoxic impurities require ICH M7 assessment",
                  "Container closure integrity testing data absent for parenteral products",
                  "Lack of comparability data for post-approval manufacturing changes"
                ],
          Clinical: [
                  "Primary endpoint not met with statistical significance in pivotal trial",
                  "Inadequate patient population diversity in clinical studies",
                  "Missing long-term safety data — post-marketing requirement likely",
                  "Drug-drug interaction (DDI) studies incomplete per FDA DDI guidance",
                  "Pediatric study plan (iPSP) not submitted or inadequate",
                  "REMS requirement not addressed — based on safety signals"
                ],
          Labelling: [
                  "Proposed indication not supported by clinical data",
                  "Dosing recommendations for renal/hepatic impairment absent",
                  "Contraindications section incomplete based on clinical findings",
                  "Pregnancy and lactation data not adequately reflected",
                  "Boxed warning required based on safety profile"
                ]
    },
    EMA: {
          CMC: [
                  "ASMF/DMF reference incomplete — holder must provide access letter",
                  "Batch analysis data insufficient — minimum 3 pilot/production batches required",
                  "Missing XRPD data for polymorphic forms of API",
                  "Dissolution method not discriminating — robustness data required",
                  "CEP (Certificate of Suitability) required for API from European Pharmacopoeia monograph substance"
                ],
          Clinical: [
                  "CHMP scientific advice not followed — justification required",
                  "PASS (Post-Authorisation Safety Study) commitments not proposed",
                  "Paediatric Investigation Plan (PIP) compliance not demonstrated",
                  "Benefit-risk balance not clearly articulated in Clinical Overview",
                  "EPAR-relevant information missing from clinical summaries"
                ],
          Pharmacovigilance: [
                  "Risk Management Plan (RMP) does not address identified risks",
                  "QPPV (Qualified Person for Pharmacovigilance) details incomplete",
                  "Pharmacovigilance system master file (PSMF) location not provided",
                  "Missing routine risk minimisation measures in RMP"
                ]
    }
};

// ─── Server Setup ─────────────────────────────────────────────────────────

function createMcpServer(): Server {
    const server = new Server(
      { name: "regsub-mcp", version: "1.0.0" },
      { capabilities: { tools: {} } }
        );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: [
          {
                    name: "lookup_ich_guideline",
                    description: "Look up an ICH guideline by code (e.g. E6(R3), M4, Q1A). Returns scope, key requirements, and official URL.",
                    inputSchema: {
                                type: "object",
                                properties: {
                                              guideline_code: { type: "string", description: "ICH guideline code, e.g. 'E6(R3)', 'M4(R4)', 'Q3D(R2)', 'M7(R2)'" }
                                },
                                required: ["guideline_code"]
                    }
          },
          {
                    name: "map_ctd_section",
                    description: "Map a document type or data package to the correct CTD/eCTD module and section. Returns the full section hierarchy.",
                    inputSchema: {
                                type: "object",
                                properties: {
                                              module: { type: "string", description: "CTD module number: '1', '2', '3', '4', or '5'" },
                                              submission_type: { type: "string", description: "Submission type: 'NDA', 'BLA', 'MAA', or 'JNDA'" }
                                },
                                required: ["module"]
                    }
          },
          {
                    name: "check_ctd_completeness",
                    description: "Check a list of provided CTD sections against required sections and identify gaps.",
                    inputSchema: {
                                type: "object",
                                properties: {
                                              provided_sections: { type: "array", items: { type: "string" }, description: "List of CTD sections already prepared" },
                                              submission_type: { type: "string", description: "Target submission type: 'NDA', 'BLA', or 'MAA'" },
                                              module: { type: "string", description: "Which module to check: '3', '4', or '5'" }
                                },
                                required: ["provided_sections", "submission_type", "module"]
                    }
          },
          {
                    name: "get_agency_deficiency_guidance",
                    description: "Retrieve common deficiency areas for FDA or EMA submissions by domain (CMC, Clinical, Labelling, Pharmacovigilance).",
                    inputSchema: {
                                type: "object",
                                properties: {
                                              agency: { type: "string", description: "Regulatory agency: 'FDA' or 'EMA'" },
                                              domain: { type: "string", description: "Area: 'CMC', 'Clinical', 'Labelling', or 'Pharmacovigilance'" }
                                },
                                required: ["agency", "domain"]
                    }
          },
          {
                    name: "generate_submission_checklist",
                    description: "Generate a submission readiness checklist for a given submission type and agency.",
                    inputSchema: {
                                type: "object",
                                properties: {
                                              submission_type: { type: "string", description: "Type: 'NDA', 'BLA', 'MAA', 'IND', 'CTA', 'IMPD'" },
                                              agency: { type: "string", description: "Target agency: 'FDA', 'EMA', 'PMDA', 'Health Canada'" }
                                },
                                required: ["submission_type", "agency"]
                    }
          },
          {
                    name: "check_ich_compliance",
                    description: "Check a description of a study or document against ICH guideline requirements and return a compliance assessment.",
                    inputSchema: {
                                type: "object",
                                properties: {
                                              description: { type: "string", description: "Description of the study or document to assess" },
                                              guideline_code: { type: "string", description: "ICH guideline to check against, e.g. 'E6(R3)', 'Q1A(R2)'" }
                                },
                                required: ["description", "guideline_code"]
                    }
          }
              ]
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;

                               if (name === "lookup_ich_guideline") {
                                       const { guideline_code } = z.object({ guideline_code: z.string() }).parse(args);
                                       const code = guideline_code.toUpperCase().trim();
                                       const guideline = ICH_GUIDELINES[code];
                                       if (!guideline) {
                                                 return { content: [{ type: "text", text: "Guideline " + code + " not found. Available: " + Object.keys(ICH_GUIDELINES).join(", ") }] };
                                       }
                                       return {
                                                 content: [{ type: "text", text: "# ICH " + code + ": " + guideline.title + "\n\n**Scope:** " + guideline.scope + "\n\n**Key Requirements:**\n" + guideline.keyRequirements.map((r, i) => (i+1) + ". " + r).join("\n") + "\n\n**Official Resource:** " + guideline.url }]
                                       };
                               }

                               if (name === "map_ctd_section") {
                                       const { module } = z.object({ module: z.string(), submission_type: z.string().optional() }).parse(args);
                                       const moduleData = CTD_MODULES[module];
                                       if (!moduleData) return { content: [{ type: "text", text: "Module " + module + " not recognised. Valid modules: 1, 2, 3, 4, 5." }] };
                                       const sections = Object.entries(moduleData.sections).map(([k, v]) => "- **" + k + "**: " + v).join("\n");
                                       return { content: [{ type: "text", text: "# CTD Module " + module + ": " + moduleData.title + "\n\n**Applicable Submission Types:** " + moduleData.submissionType.join(", ") + "\n\n**Sections:**\n" + sections }] };
                               }

                               if (name === "check_ctd_completeness") {
                                       const { provided_sections, submission_type, module } = z.object({ provided_sections: z.array(z.string()), submission_type: z.string(), module: z.string() }).parse(args);
                                       const moduleData = CTD_MODULES[module];
                                       if (!moduleData) return { content: [{ type: "text", text: "Module " + module + " not found." }] };
                                       const allRequired = Object.keys(moduleData.sections);
                                       const missing = allRequired.filter(s => !provided_sections.some(p => p.startsWith(s) || s.startsWith(p)));
                                       const provided = allRequired.filter(s => provided_sections.some(p => p.startsWith(s) || s.startsWith(p)));
                                       const score = Math.round((provided.length / allRequired.length) * 100);
                                       return { content: [{ type: "text", text: "# CTD Module " + module + " Completeness Check\n**Submission:** " + submission_type + "\n**Score:** " + score + "%\n\n**Provided (" + provided.length + "):**\n" + provided.map(s => "- " + s + ": " + moduleData.sections[s]).join("\n") + "\n\n**Missing (" + missing.length + "):**\n" + missing.map(s => "- " + s + ": " + moduleData.sections[s]).join("\n") }] };
                               }

                               if (name === "get_agency_deficiency_guidance") {
                                       const { agency, domain } = z.object({ agency: z.string(), domain: z.string() }).parse(args);
                                       const agencyData = AGENCY_DEFICIENCIES[agency.toUpperCase()];
                                       if (!agencyData) return { content: [{ type: "text", text: "Agency " + agency + " not found. Supported: FDA, EMA." }] };
                                       const deficiencies = agencyData[domain];
                                       if (!deficiencies) return { content: [{ type: "text", text: "Domain " + domain + " not found for " + agency + ". Available: " + Object.keys(agencyData).join(", ") }] };
                                       return { content: [{ type: "text", text: "# " + agency.toUpperCase() + " Common Deficiencies — " + domain + "\n\n" + deficiencies.map((d, i) => (i+1) + ". " + d).join("\n") }] };
                               }

                               if (name === "generate_submission_checklist") {
                                       const { submission_type, agency } = z.object({ submission_type: z.string(), agency: z.string() }).parse(args);
                                       const checklists: Record<string, Record<string, string[]>> = {
                                                 NDA: { FDA: ["Cover letter and Form FDA 356h", "Module 1: Proposed labelling (PI, Medication Guide if applicable)", "Module 1: Patent certifications", "Module 1: Debarment certification", "Module 1: Financial disclosure (Form FDA 3454/3455)", "Module 2.3: Quality Overall Summary", "Module 2.4: Nonclinical Overview", "Module 2.5: Clinical Overview", "Module 2.6: Nonclinical Written and Tabulated Summaries", "Module 2.7: Clinical Summary", "Module 3: Full CMC documentation (3.2.S and 3.2.P)", "Module 4: All nonclinical study reports", "Module 5: All clinical study reports (pivotal trials)", "Module 5: Integrated Summary of Safety (ISS)", "Module 5: Integrated Summary of Efficacy (ISE)", "PREA compliance / iPSP or waiver/deferral", "REMS (if required based on safety profile)", "User fee payment confirmation (PDUFA)"] },
                                                 MAA: { EMA: ["Module 1.0: Cover letter", "Module 1.2: Application form (eAF)", "Module 1.3: Product information (SmPC, PIL, labelling)", "Module 1.7: EudraVigilance registration confirmation", "Module 1.8: Clinical trial information (EudraCT)", "Module 1.10: Pharmacovigilance system summary", "Module 1.11: Risk Management Plan (RMP)", "Module 2-5: Full CTD technical documentation", "Paediatric Investigation Plan (PIP) compliance", "CHMP scientific advice follow-up (if applicable)", "GMP compliance documentation for manufacturing sites", "ASMF or CEP for drug substance (if applicable)", "Environmental Risk Assessment (ERA)", "EMA application fee payment"] },
                                                 IND: { FDA: ["Form FDA 1571 (IND application cover sheet)", "Table of contents", "Introductory statement and general investigational plan", "Investigator's Brochure (IB)", "Protocol(s) and amendments", "Chemistry, Manufacturing, and Controls (CMC) information", "Pharmacology and toxicology information", "Previous human experience (if any)", "Additional information (PK, bioavailability)", "Institutional Review Board (IRB) confirmation", "Sponsor-investigator certifications"] }
                                       };
                                       const checklist = checklists[submission_type.toUpperCase()]?.[agency.toUpperCase()];
                                       if (!checklist) return { content: [{ type: "text", text: "Checklist for " + submission_type + " (" + agency + ") not available. Currently: NDA (FDA), MAA (EMA), IND (FDA)." }] };
                                       return { content: [{ type: "text", text: "# " + submission_type.toUpperCase() + " Submission Checklist (" + agency.toUpperCase() + ")\n\n" + checklist.map((item, i) => "- [ ] " + (i+1) + ". " + item).join("\n") + "\n\n**Total:** " + checklist.length + " items" }] };
                               }

                               if (name === "check_ich_compliance") {
                                       const { description, guideline_code } = z.object({ description: z.string(), guideline_code: z.string() }).parse(args);
                                       const code = guideline_code.toUpperCase().trim();
                                       const guideline = ICH_GUIDELINES[code];
                                       if (!guideline) return { content: [{ type: "text", text: "Guideline " + code + " not in database. Available: " + Object.keys(ICH_GUIDELINES).join(", ") }] };
                                       const descLower = description.toLowerCase();
                                       const assessments = guideline.keyRequirements.map(req => {
                                                 const keywords = req.toLowerCase().split(" ").filter(w => w.length > 5).slice(0, 3);
                                                 const mentioned = keywords.some(kw => descLower.includes(kw));
                                                 return { requirement: req, status: mentioned ? "Addressed" : "Not clearly addressed — review needed" };
                                       });
                                       const passed = assessments.filter(a => a.status === "Addressed").length;
                                       return { content: [{ type: "text", text: "# ICH " + code + " Compliance Assessment\n**Guideline:** " + guideline.title + "\n**Score:** " + passed + "/" + assessments.length + " requirements addressed\n\n" + assessments.map(a => "**" + (a.status === "Addressed" ? "✅" : "⚠️") + " " + a.status + "**\n_Requirement:_ " + a.requirement).join("\n\n") + "\n\n> Full compliance requires expert review. Official guidance: " + guideline.url }] };
                               }

                               return { content: [{ type: "text", text: "Unknown tool: " + name }], isError: true };
  });

  return server;
}

// ——— HTTP Server with Streamable HTTP transport ————————————————

const PORT = parseInt(process.env.PORT || "8080", 10);

async function main() {
    const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => crypto.randomUUID(),
    });

  const server = createMcpServer();
    await server.connect(transport);

  const httpServer = http.createServer(async (req: any, res: any) => {
        const url = new URL(req.url || "/", "http://localhost");

                                           // Health check
                                           if (req.method === "GET" && url.pathname === "/health") {
                                                   res.writeHead(200, { "Content-Type": "application/json" });
                                                   res.end(JSON.stringify({ status: "ok", server: "regsub-mcp", version: "1.0.0" }));
                                                   return;
                                           }

                                           // MCP endpoint — POST only
                                           if (url.pathname === "/mcp") {
                                                   if (req.method !== "POST") {
                                                             res.writeHead(405, { "Content-Type": "application/json", "Allow": "POST" });
                                                             res.end(JSON.stringify({ error: "Method Not Allowed" }));
                                                             return;
                                                   }
                                                   try {
                                                             await transport.handleRequest(req, res);
                                                   } catch (err: any) {
                                                             console.error("MCP handleRequest error:", err?.message || String(err));
                                                             if (!res.headersSent) {
                                                                         res.writeHead(500, { "Content-Type": "application/json" });
                                                                         res.end(JSON.stringify({ error: err?.message || "Internal error" }));
                                                             }
                                                   }
                                                   return;
                                           }

                                           res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Not found" }));
  });

  httpServer.listen(PORT, "0.0.0.0", () => {
        console.log("Regulatory Submission Intelligence MCP server listening on port " + PORT);
        console.log("MCP endpoint: http://0.0.0.0:" + PORT + "/mcp");
        console.log("Health check: http://0.0.0.0:" + PORT + "/health");
  });
}

main().catch(console.error);
