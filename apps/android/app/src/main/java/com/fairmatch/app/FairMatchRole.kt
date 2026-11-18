package com.fairmatch.app

enum class FairMatchRole(
    val title: String,
    val outcome: String,
    val requiresApproval: Boolean,
) {
    SCHOOL_STUDENT("School student", "Explore careers and build a safe learning plan", false),
    COLLEGE_STUDENT("College student", "Find internships and placement opportunities", false),
    JOB_SEEKER("Job seeker", "Manage a focused, explainable job search", false),
    COLLEGE_COORDINATOR("College coordinator", "Run fair placement operations", true),
    COLLEGE_ADMIN("College administrator", "Govern cohorts, outcomes and access", true),
    COMPANY_HR("Company HR", "Create roles and lead human hiring decisions", true),
    COMPANY_ADMIN("Company administrator", "Manage company hiring operations", true),
    PLATFORM_ADMIN("Platform administrator", "Govern FairMatch safely", true),
}

data class ProductCapability(
    val title: String,
    val detail: String,
    val availableOnMobile: Boolean,
)

object FairMatchCapabilities {
    fun forRole(role: FairMatchRole) = when (role) {
        FairMatchRole.SCHOOL_STUDENT -> listOf(
            ProductCapability("Career pathways", "Explore interests, subjects and safe next steps.", true),
            ProductCapability("Guided AI mode", "Age-aware guidance without external AI data transfer.", true),
            ProductCapability("Learning roadmap", "Track small, practical exploration goals.", true),
        )
        FairMatchRole.COLLEGE_STUDENT, FairMatchRole.JOB_SEEKER -> listOf(
            ProductCapability("Opportunity matching", "See roles with the evidence and gaps behind each match.", true),
            ProductCapability("Applications", "Apply, attach approved documents and follow each decision.", true),
            ProductCapability("Career guide", "Get explainable plans, not unexplained scores.", true),
        )
        FairMatchRole.COMPANY_HR, FairMatchRole.COMPANY_ADMIN -> listOf(
            ProductCapability("Hiring workspace", "Publish roles and manage a human-led candidate pipeline.", true),
            ProductCapability("Interview workspace", "Coordinate interviews and capture structured feedback.", false),
            ProductCapability("Fair hiring copilot", "Prepare job-relevant questions and workflow summaries.", true),
        )
        FairMatchRole.COLLEGE_COORDINATOR, FairMatchRole.COLLEGE_ADMIN -> listOf(
            ProductCapability("Placement operations", "Manage cohorts, eligibility and drive activity.", false),
            ProductCapability("Outcome intelligence", "Review transparent aggregate readiness signals.", true),
            ProductCapability("Coordinator workflow", "Keep colleges, students and companies connected.", true),
        )
        FairMatchRole.PLATFORM_ADMIN -> listOf(
            ProductCapability("Governance", "Approve elevated access and organisation requests.", false),
            ProductCapability("Audit trail", "Review sensitive changes and decisions.", false),
            ProductCapability("Platform operations", "Use privacy-safe operational intelligence.", false),
        )
    }
}
