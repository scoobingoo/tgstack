// EXAMPLE: onboarding wizard. Delete this folder and the `OnboardingModule`
// import in app.module.ts to remove it; nothing else depends on it.
import { Module } from "@nestjs/common";
import { OnboardingConversationProvider } from "./onboarding.conversation.js";
import { OnboardingUpdate } from "./onboarding.update.js";

@Module({
  providers: [OnboardingConversationProvider, OnboardingUpdate],
})
export class OnboardingModule {}
