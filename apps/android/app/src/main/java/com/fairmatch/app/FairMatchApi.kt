package com.fairmatch.app

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.engine.android.Android
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.contentType
import io.ktor.client.request.get
import io.ktor.client.request.patch
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

@Serializable
data class RegisterRequest(
    val fullName: String,
    val email: String,
    val password: String,
    val requestedRole: String,
    val organisationName: String? = null,
)

@Serializable
data class LoginRequest(val email: String, val password: String)

@Serializable
data class PortalLoginRequest(val role: String)

@Serializable
data class RefreshRequest(val refreshToken: String)

@Serializable
data class ApiUser(
    val id: String,
    val email: String,
    val role: String,
    val accountStatus: String,
    val emailVerified: Boolean,
)

@Serializable
data class AuthPayload(
    val accessToken: String,
    val refreshToken: String,
    val user: ApiUser,
)

@Serializable
data class RegistrationPayload(
    val id: String,
    val email: String,
    val role: String,
    val accountStatus: String,
    val verificationRequired: Boolean,
    val message: String? = null,
)

@Serializable
data class ApiError(val error: String? = null, val code: String? = null)

@Serializable
data class MePayload(val user: ApiUser)

@Serializable
data class ApiOpportunity(
    val id: String,
    val title: String,
    val type: String,
    val location: String? = null,
    val workMode: String,
    val description: String,
    val organisationName: String,
    val publishedAt: String,
)

@Serializable
data class OpportunitiesPayload(val items: List<ApiOpportunity>, val total: Int = 0)

@Serializable
data class ApplyRequest(val opportunityId: String, val coverNote: String? = null)

@Serializable
data class ApplicationOpportunity(
    val id: String,
    val title: String,
    val type: String,
    val location: String? = null,
    val workMode: String,
    val organisationName: String,
)

@Serializable
data class ApiApplication(
    val id: String,
    val status: String,
    val submittedAt: String,
    val updatedAt: String,
    val coverNote: String? = null,
    val opportunity: ApplicationOpportunity,
)

@Serializable
data class ApplicationsPayload(val items: List<ApiApplication>)

@Serializable
data class UpdateApplicationRequest(val applicationId: String, val action: String)

@Serializable
data class AiGuideRequest(val message: String, val context: String)

@Serializable
data class GuidedAnswer(
    val answer: String,
    val confidence: String,
    val nextActions: List<String> = emptyList(),
    val limitations: String = "",
)

@Serializable
data class AiGuidePayload(val answer: GuidedAnswer)

@Serializable
data class NotificationItem(
    val id: String,
    val title: String,
    val body: String,
    val category: String,
    val readAt: String? = null,
    val createdAt: String,
)

@Serializable
data class NotificationsPayload(val items: List<NotificationItem>, val unreadCount: Int = 0)

class FairMatchApiException(message: String) : Exception(message)

/**
 * The only network boundary used by Android. It calls the FairMatch HTTPS API;
 * it never connects to MySQL or an AI provider directly.
 */
class FairMatchApi(private val baseUrl: String = BuildConfig.API_BASE_URL) {
    private val http = HttpClient(Android) {
        install(ContentNegotiation) {
            json(Json { ignoreUnknownKeys = true; explicitNulls = false })
        }
        install(HttpTimeout) {
            connectTimeoutMillis = 10_000
            requestTimeoutMillis = 20_000
            socketTimeoutMillis = 20_000
        }
    }

    private fun endpoint(path: String): String {
        if (baseUrl.isBlank()) throw FairMatchApiException("FairMatch API is not configured in this build.")
        return "${baseUrl.trimEnd('/')}$path"
    }

    suspend fun register(request: RegisterRequest): RegistrationPayload {
        val response = http.post(endpoint("/api/v1/auth/register")) {
            contentType(ContentType.Application.Json)
            headers.append("X-FairMatch-Client", "android")
            setBody(request)
        }
        return response.requireSuccess { response.body() }
    }

    suspend fun login(email: String, password: String): AuthPayload {
        val response = http.post(endpoint("/api/v1/auth/login")) {
            contentType(ContentType.Application.Json)
            headers.append("X-FairMatch-Client", "android")
            setBody(LoginRequest(email.trim().lowercase(), password))
        }
        return response.requireSuccess { response.body() }
    }

    suspend fun loginPortal(role: String): AuthPayload {
        val response = http.post(endpoint("/api/v1/auth/portal-login")) {
            contentType(ContentType.Application.Json)
            headers.append("X-FairMatch-Client", "android")
            setBody(PortalLoginRequest(role))
        }
        return response.requireSuccess { response.body() }
    }

    suspend fun refresh(refreshToken: String): AuthPayload {
        val response = http.post(endpoint("/api/v1/auth/refresh")) {
            contentType(ContentType.Application.Json)
            headers.append("X-FairMatch-Client", "android")
            setBody(RefreshRequest(refreshToken))
        }
        return response.requireSuccess { response.body() }
    }

    suspend fun currentUser(accessToken: String): ApiUser {
        val response = http.get(endpoint("/api/v1/me")) {
            headers.append("Authorization", "Bearer $accessToken")
        }
        return response.requireSuccess<MePayload> { response.body() }.user
    }

    suspend fun listOpportunities(): List<ApiOpportunity> {
        val response = http.get(endpoint("/api/v1/opportunities"))
        return response.requireSuccess<OpportunitiesPayload> { response.body() }.items
    }

    suspend fun submitApplication(accessToken: String, opportunityId: String, coverNote: String? = null) {
        val response = http.post(endpoint("/api/v1/applications")) {
            contentType(ContentType.Application.Json)
            headers.append("Authorization", "Bearer $accessToken")
            setBody(ApplyRequest(opportunityId, coverNote))
        }
        response.requireSuccess { Unit }
    }

    suspend fun listApplications(accessToken: String): List<ApiApplication> {
        val response = http.get(endpoint("/api/v1/applications")) {
            headers.append("Authorization", "Bearer $accessToken")
        }
        return response.requireSuccess<ApplicationsPayload> { response.body() }.items
    }

    suspend fun withdrawApplication(accessToken: String, applicationId: String) {
        val response = http.patch(endpoint("/api/v1/applications")) {
            contentType(ContentType.Application.Json)
            headers.append("Authorization", "Bearer $accessToken")
            setBody(UpdateApplicationRequest(applicationId, "withdraw"))
        }
        response.requireSuccess { Unit }
    }

    suspend fun askAiGuide(accessToken: String, message: String, context: String): GuidedAnswer {
        val response = http.post(endpoint("/api/v1/ai/guide")) {
            contentType(ContentType.Application.Json)
            headers.append("Authorization", "Bearer $accessToken")
            setBody(AiGuideRequest(message, context))
        }
        return response.requireSuccess<AiGuidePayload> { response.body() }.answer
    }

    suspend fun listNotifications(accessToken: String): NotificationsPayload {
        val response = http.get(endpoint("/api/v1/notifications")) {
            headers.append("Authorization", "Bearer $accessToken")
        }
        return response.requireSuccess { response.body() }
    }

    private suspend inline fun <reified T> io.ktor.client.statement.HttpResponse.requireSuccess(crossinline success: suspend () -> T): T {
        if (status.value in 200..299) return success()
        val detail = runCatching { Json { ignoreUnknownKeys = true }.decodeFromString<ApiError>(bodyAsText()).error }.getOrNull()
        throw FairMatchApiException(detail ?: "FairMatch could not complete this request (${status.value}).")
    }
}
