package com.fairmatch.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { FairMatchTheme { FairMatchApp(SessionStore(this)) } }
    }
}

private enum class MobileStage { Welcome, Role, Authenticate, Workspace }
private enum class WorkspaceTab(val label: String) { Home("Home"), Opportunities("Roles"), Applications("Applied"), Guide("AI Guide"), Updates("Updates") }

@Composable
private fun FairMatchApp(sessionStore: SessionStore) {
    var stage by remember { mutableStateOf(MobileStage.Welcome) }
    var selectedRole by remember { mutableStateOf(FairMatchRole.COLLEGE_STUDENT) }
    var authPayload by remember { mutableStateOf<AuthPayload?>(null) }

    when (stage) {
        MobileStage.Welcome -> WelcomeScreen({ stage = MobileStage.Role }, { stage = MobileStage.Authenticate })
        MobileStage.Role -> RoleScreen(selectedRole, { selectedRole = it }, { stage = MobileStage.Authenticate })
        MobileStage.Authenticate -> AuthenticationScreen(
            selectedRole,
            sessionStore,
            onAuthenticated = { payload -> authPayload = payload; stage = MobileStage.Workspace },
            onBack = { stage = MobileStage.Welcome },
        )
        MobileStage.Workspace -> {
            val payload = authPayload ?: return
            WorkspaceScreen(
                payload = payload,
                onSignOut = { sessionStore.clear(); authPayload = null; stage = MobileStage.Welcome },
            )
        }
    }
}

@Composable
private fun WelcomeScreen(onCreateAccount: () -> Unit, onSignIn: () -> Unit) = Column(
    Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).padding(24.dp),
    verticalArrangement = Arrangement.SpaceBetween,
) {
    Column {
        Text("fairmatch", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Black)
        Spacer(Modifier.height(72.dp))
        Text("Make the next\nright move.", style = MaterialTheme.typography.displaySmall, fontWeight = FontWeight.ExtraBold)
        Spacer(Modifier.height(16.dp))
        Text("Explore careers, internships, placements and work opportunities in one connected, privacy-first workspace.", style = MaterialTheme.typography.bodyLarge)
    }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Button(onClick = onCreateAccount, modifier = Modifier.fillMaxWidth(), contentPadding = PaddingValues(vertical = 16.dp)) { Text("Create secure account") }
        OutlinedButton(onClick = onSignIn, modifier = Modifier.fillMaxWidth(), contentPadding = PaddingValues(vertical = 16.dp)) { Text("Sign in to a portal") }
        Text("FairMatch keeps consequential decisions with people, not AI.", style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
private fun RoleScreen(selected: FairMatchRole, onSelect: (FairMatchRole) -> Unit, onContinue: () -> Unit) = Scaffold(
    topBar = { FairMatchTopBar("Choose your workspace") },
) { padding ->
    Column(Modifier.padding(padding).fillMaxSize()) {
        Text("Select the role that reflects your purpose today.", Modifier.padding(horizontal = 24.dp, vertical = 8.dp))
        LazyColumn(contentPadding = PaddingValues(24.dp), verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.weight(1f)) {
            items(FairMatchRole.entries) { role -> RoleCard(role, role == selected) { onSelect(role) } }
        }
        Button(onClick = onContinue, modifier = Modifier.fillMaxWidth().padding(24.dp), contentPadding = PaddingValues(vertical = 16.dp)) {
            Text(if (selected.requiresApproval) "Continue to portal" else "Continue")
        }
    }
}

@Composable
private fun AuthenticationScreen(role: FairMatchRole, sessionStore: SessionStore, onAuthenticated: (AuthPayload) -> Unit, onBack: () -> Unit) {
    var register by remember { mutableStateOf(false) }
    var name by remember { mutableStateOf("") }
    var organisation by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var message by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val api = remember { FairMatchApi() }

    Scaffold(topBar = { FairMatchTopBar(if (register) "Create your account" else "Sign in") }) { padding ->
        LazyColumn(Modifier.padding(padding).fillMaxSize(), contentPadding = PaddingValues(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (!register) {
                item {
                    OutlinedButton(
                        enabled = !busy,
                        onClick = {
                            scope.launch {
                                busy = true; message = ""
                                try {
                                    val result = api.loginPortal(role.name.lowercase())
                                    sessionStore.save(result)
                                    onAuthenticated(result)
                                } catch (error: Exception) {
                                    message = error.message ?: "Portal sign-in failed."
                                } finally { busy = false }
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text("Quick sign in: ${role.title}") }
                }
            }
            if (register) item { OutlinedTextField(name, { name = it }, label = { Text("Full name") }, modifier = Modifier.fillMaxWidth()) }
            item { OutlinedTextField(email, { email = it }, label = { Text("Email address") }, modifier = Modifier.fillMaxWidth()) }
            item { OutlinedTextField(password, { password = it }, label = { Text("Password (12+ characters)") }, visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth()) }
            if (register && role.requiresApproval) item { OutlinedTextField(organisation, { organisation = it }, label = { Text("College or company name") }, modifier = Modifier.fillMaxWidth()) }
            if (message.isNotBlank()) item { Text(message, color = MaterialTheme.colorScheme.error) }
            item {
                Button(
                    enabled = !busy,
                    onClick = {
                        scope.launch {
                            busy = true; message = ""
                            try {
                                if (register) {
                                    val result = api.register(RegisterRequest(name, email, password, role.name.lowercase(), organisation.ifBlank { null }))
                                    message = result.message ?: "Account created. Please sign in."
                                    register = false
                                } else {
                                    val result = api.login(email, password)
                                    sessionStore.save(result)
                                    onAuthenticated(result)
                                }
                            } catch (error: Exception) {
                                message = error.message ?: "FairMatch could not complete this request."
                            } finally { busy = false }
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                    contentPadding = PaddingValues(vertical = 16.dp),
                ) { Text(if (busy) "Please wait…" else if (register) "Create account" else "Sign in with email") }
            }
            item { OutlinedButton(onClick = { register = !register; message = "" }, modifier = Modifier.fillMaxWidth()) { Text(if (register) "Already registered? Sign in" else "Need an account? Register") } }
            item { OutlinedButton(onClick = onBack, modifier = Modifier.fillMaxWidth()) { Text("Back") } }
        }
    }
}

@Composable
private fun WorkspaceScreen(payload: AuthPayload, onSignOut: () -> Unit) {
    val user = payload.user
    val token = payload.accessToken
    val role = FairMatchRole.entries.firstOrNull { it.name.lowercase() == user.role } ?: FairMatchRole.COLLEGE_STUDENT
    var tab by remember { mutableStateOf(WorkspaceTab.Home) }
    val api = remember { FairMatchApi() }
    val scope = rememberCoroutineScope()

    var opportunities by remember { mutableStateOf<List<ApiOpportunity>>(emptyList()) }
    var applications by remember { mutableStateOf<List<ApiApplication>>(emptyList()) }
    var notifications by remember { mutableStateOf<List<NotificationItem>>(emptyList()) }
    var statusMessage by remember { mutableStateOf("") }
    var aiQuestion by remember { mutableStateOf("") }
    var aiAnswer by remember { mutableStateOf<GuidedAnswer?>(null) }
    var aiBusy by remember { mutableStateOf(false) }

    LaunchedEffect(tab) {
        statusMessage = ""
        runCatching {
            when (tab) {
                WorkspaceTab.Opportunities -> opportunities = api.listOpportunities()
                WorkspaceTab.Applications -> applications = api.listApplications(token)
                WorkspaceTab.Updates -> notifications = api.listNotifications(token).items
                else -> Unit
            }
        }.onFailure { statusMessage = it.message ?: "Could not refresh data." }
    }

    Scaffold(
        topBar = { FairMatchTopBar(role.title) },
        bottomBar = {
            NavigationBar {
                WorkspaceTab.entries.forEach { item ->
                    NavigationBarItem(selected = tab == item, onClick = { tab = item }, icon = { Text(item.label.take(1), fontWeight = FontWeight.Bold) }, label = { Text(item.label) })
                }
            }
        },
    ) { padding ->
        LazyColumn(Modifier.padding(padding).fillMaxSize(), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (statusMessage.isNotBlank()) item { Text(statusMessage, color = MaterialTheme.colorScheme.primary) }
            when (tab) {
                WorkspaceTab.Home -> {
                    item {
                        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primary)) {
                            Column(Modifier.padding(20.dp)) {
                                Text("CONNECTED WORKSPACE", color = MaterialTheme.colorScheme.onPrimary)
                                Spacer(Modifier.height(6.dp))
                                Text("Welcome, ${user.email}", color = MaterialTheme.colorScheme.onPrimary, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                                Text(if (user.accountStatus == "pending_approval") "Your organisation request is pending verification." else "Your secure workspace is active.", color = MaterialTheme.colorScheme.onPrimary)
                            }
                        }
                    }
                    items(FairMatchCapabilities.forRole(role)) { item ->
                        Card { Column(Modifier.padding(16.dp)) { Text(item.title, fontWeight = FontWeight.Bold); Spacer(Modifier.height(4.dp)); Text(item.detail) } }
                    }
                    item { OutlinedButton(onClick = onSignOut, modifier = Modifier.fillMaxWidth()) { Text("Sign out") } }
                }
                WorkspaceTab.Opportunities -> {
                    items(opportunities) { opp ->
                        Card {
                            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Text("${opp.type.uppercase()} · ${opp.workMode}", style = MaterialTheme.typography.labelSmall)
                                Text(opp.title, fontWeight = FontWeight.Bold)
                                Text("${opp.organisationName} · ${opp.location ?: "Remote"}")
                                Text(opp.description, maxLines = 3, overflow = TextOverflow.Ellipsis)
                                if (user.role == "college_student" || user.role == "job_seeker") {
                                    Button(onClick = {
                                        scope.launch {
                                            runCatching { api.submitApplication(token, opp.id) }
                                                .onSuccess { statusMessage = "Applied to ${opp.title}." }
                                                .onFailure { statusMessage = it.message ?: "Application failed." }
                                        }
                                    }) { Text("Apply now") }
                                }
                            }
                        }
                    }
                }
                WorkspaceTab.Applications -> {
                    items(applications) { app ->
                        Card {
                            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Text(app.status.uppercase(), style = MaterialTheme.typography.labelSmall)
                                Text(app.opportunity.title, fontWeight = FontWeight.Bold)
                                Text(app.opportunity.organisationName)
                                if (app.status in listOf("submitted", "shortlisted", "interview", "offer")) {
                                    OutlinedButton(onClick = {
                                        scope.launch {
                                            runCatching {
                                                api.withdrawApplication(token, app.id)
                                                applications = api.listApplications(token)
                                            }.onSuccess { statusMessage = "Application withdrawn." }
                                                .onFailure { statusMessage = it.message ?: "Could not withdraw." }
                                        }
                                    }) { Text("Withdraw") }
                                }
                            }
                        }
                    }
                }
                WorkspaceTab.Guide -> {
                    item {
                        val aiContext = when (user.role) {
                            "company_hr", "company_admin" -> "recruiting_support"
                            "college_coordinator", "college_admin" -> "cohort_insight"
                            "platform_admin" -> "platform_operations"
                            else -> "career_guidance"
                        }
                        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            OutlinedTextField(aiQuestion, { aiQuestion = it }, label = { Text("Ask FairMatch AI Guide") }, modifier = Modifier.fillMaxWidth())
                            Button(
                                enabled = !aiBusy && aiQuestion.isNotBlank(),
                                onClick = {
                                    scope.launch {
                                        aiBusy = true; statusMessage = ""
                                        runCatching { api.askAiGuide(token, aiQuestion, aiContext) }
                                            .onSuccess { aiAnswer = it }
                                            .onFailure { statusMessage = it.message ?: "AI Guide request failed." }
                                        aiBusy = false
                                    }
                                },
                                modifier = Modifier.fillMaxWidth(),
                            ) { Text(if (aiBusy) "Thinking…" else "Ask Guide") }
                            aiAnswer?.let { ans ->
                                Card {
                                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                        Text("FairMatch Guide (${ans.confidence} evidence)", fontWeight = FontWeight.Bold)
                                        Text(ans.answer)
                                        ans.nextActions.forEach { step -> Text("• $step") }
                                    }
                                }
                            }
                        }
                    }
                }
                WorkspaceTab.Updates -> {
                    items(notifications) { note ->
                        Card { Column(Modifier.padding(16.dp)) { Text(note.title, fontWeight = FontWeight.Bold); Text(note.body) } }
                    }
                }
            }
        }
    }
}

@Composable
private fun RoleCard(role: FairMatchRole, selected: Boolean, onSelect: () -> Unit) = Card(
    modifier = Modifier.fillMaxWidth().clickable(onClick = onSelect),
    colors = CardDefaults.cardColors(containerColor = if (selected) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface),
    border = if (selected) CardDefaults.outlinedCardBorder() else null,
) {
    Row(Modifier.padding(18.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.width(10.dp).height(42.dp).background(if (selected) MaterialTheme.colorScheme.secondary else Color.Transparent, RoundedCornerShape(8.dp)))
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) { Text(role.title, fontWeight = FontWeight.Bold); Text(role.outcome, maxLines = 2, overflow = TextOverflow.Ellipsis) }
        if (role.requiresApproval) Text("Approval")
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FairMatchTopBar(title: String) = TopAppBar(title = { Text(title, fontWeight = FontWeight.Bold) }, colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background))
