# Call wake-ups on iOS and Android (VoIP push)

This page is for a team shipping the Nativetalk Call SDK inside **their own
app, published from their own Apple and Google accounts**.

It covers what you set up, what you send us, and how to check it worked.

If you publish under Nativetalk's Apple team instead, you need none of this.
Everything here is about the case where the app is yours.

## Why this is needed

When your app is in the background, the phone suspends it and its SIP
connection closes. The call server still thinks the phone is there, so the call
is offered to nobody and rings out.

To stop that, we send the phone a push to wake it up, a moment before the call
is offered. On iOS that is a VoIP push, which is the only kind that can wake a
suspended app and put a call screen on the lock screen. On Android it is a
high-priority data message, and your app draws its own call screen.

Both of those have to be signed by the account that owns the app. Apple will
not accept a push for your app signed by our team, and Firebase will not
deliver a message to your app from our project. So to ring your handsets, we
have to send as you, which means you give us a key.

## The whole job, in order

Some of this is done once, by a person on your team. The rest runs in your app
and your backend, every time someone signs in.

**Once, by a person on your team**

1. Add two capabilities in Xcode ([Part 1](#part-1-your-xcode-project)).
2. Make an Apple push key, and send it to us with its Key ID, your Team ID,
   your app's bundle ID and the key's environment
   ([Parts 2](#part-2-the-apple-push-key) and
   [3](#part-3-sending-it-to-us)). Sandbox while you integrate, Production
   before you ship.
3. For Android wake-ups, send us a Firebase service account
   ([Part 4](#part-4-android-and-firebase)).

We keep these and use them for every call to every one of your phones. You do
not send them again unless you replace the key.

**In your app, every time it starts**

4. Get the phone's push token: a VoIP token from PushKit on iOS, or a Firebase
   token on Android. Send it to your own backend, the same way your app already
   talks to it.
5. When a VoIP push arrives, report the call to CallKit before anything else
   ([Part 6](#part-6-the-one-rule-your-app-must-not-break)). This one has a
   permanent cost if it goes wrong.

**In your backend, every time it receives a token**

6. Send it to us for that person's SIP device, with your company API key
   ([Part 8](#part-8-registering-a-handset)). The token, the platform, and for
   an iPhone which kind of build it is. Nothing else.
7. When the person signs out, tell us to forget the token.

Then [check it](#part-5-checking-it-works), and test a real call with the app
swiped away.

Steps 4 to 7 do not have to wait for us to install your key. Tokens your
backend sends before then are kept, and start ringing as soon as the key is in.

The bundle ID in step 2 is the only time we need it. Your backend does not send
it again with each token, because every token for your app is for the same app,
and we already have it from the key.

## What we need from you

| Platform | What | Where it comes from |
|---|---|---|
| iOS | An APNs key file (`.p8`) | Apple Developer → Keys |
| iOS | Key ID (10 characters) | shown next to the key |
| iOS | Team ID (10 characters) | Apple Developer → Membership |
| iOS | Bundle ID | your app, e.g. `com.yourcompany.yourapp` |
| iOS | Which environment the key is for | you chose it when you made the key |
| Android | The service account JSON file | Firebase → Project settings → Service accounts |

These are sent once, by a person, when the key is made. Your app and your
backend never send them. Read on for how to get each one, and how to send them
to us.

## Part 1: your Xcode project

Two capabilities and one Info.plist entry. In Xcode, select your target, then
**Signing & Capabilities**:

1. Add **Push Notifications**.
2. Add **Background Modes**, and tick:
   - **Voice over IP**
   - **Audio, AirPlay, and Picture in Picture**

Then in `Info.plist`, add a microphone reason, which is the text iOS shows when
it asks:

```xml
<key>NSMicrophoneUsageDescription</key>
<string>To make and receive calls</string>
```

If you use Expo, the SDK's config plugin adds the Info.plist keys and the
background modes for you. You still have to add the **Push Notifications**
capability yourself, because that one changes your App ID at Apple and not just
a file in your project.

A build without the Voice over IP background mode will register for VoIP push
and then never receive one. There is no error. That is worth checking first if
nothing arrives.

## Part 2: the Apple push key

Sign in to [developer.apple.com](https://developer.apple.com/account), then go
to **Certificates, Identifiers & Profiles → Keys** and press **+**.

1. Give the key a name you will recognise later, such as
   `Nativetalk call wake-ups`.
2. Tick **Apple Push Notifications service (APNs)**.
3. For **Environment**, pick **Sandbox** or **Production**. A key works for one
   of them, not both. See the note below.
4. For **Key Restriction**, pick **Topic Specific**, and select only your own
   app.
5. Continue, then **Download**.

### Please use a topic-specific key

A team-scoped key can push to every app on your Apple account. A topic-specific
key can only push to the apps you select. Since you are handing the key to us,
pick the one that can only do the thing you are asking for. We do not need, and
do not want, the ability to send notifications to the rest of your apps.

Apple also lets you hold only two team-scoped keys per environment, and 200
topic-specific ones. Using a topic-specific key here keeps your two scarce keys
free.

### You will need two keys, eventually

The environment you chose is part of the key. It decides which Apple server the
key is allowed to talk to, and the two do not overlap.

- A build you run from Xcode gets a **sandbox** device token.
- A build from TestFlight or the App Store gets a **production** device token.

So while you are integrating, make a **Sandbox** key and send us that. Before
you ship, make a **Production** key and send us that one too. We store both,
and each handset is woken with the one that matches the build it is running.

If only one of them is uploaded, handsets on the other kind of build will not
ring, and the reason will say so when you check.

### Write these down before you leave the page

- The **Key ID**, which is the 10-character code shown next to the key. It is
  also in the downloaded filename: `AuthKey_XXXXXXXXXX.p8`.
- Your **Team ID**, 10 characters, on the **Membership** page.

**Apple lets you download the `.p8` once.** If you lose it, you cannot get it
back. You revoke that key and make a new one. That is not a disaster, it just
means telling us the new Key ID.

## Part 3: sending it to us

The `.p8` is a signing key. Anyone holding it can send pushes to the apps it
covers, until it is revoked.

**Please do not send it over email, WhatsApp, Slack or a ticket.** Those keep a
copy, in several places, for years.

Instead, either:

- Put it in a one-time secret link, and send us the link. A service such as
  [onetimesecret.com](https://onetimesecret.com) is fine. Send the password for
  it, if there is one, by a different route than the link.
- Or put it in an encrypted archive, and give us the password by voice.

If a key has already been through a chat window, revoke it at Apple and make a
new one. That takes two minutes and it is the only way to undo it.

Send the Key ID, Team ID, bundle ID and environment however you like. None of
those are secret on their own.

### What we do with it

The key is encrypted before it is stored, with a key that is not in the
database. Nothing reads it back out: there is no endpoint, for us or for you,
that returns a stored `.p8`. If you ever need the file again, you get it from
Apple, not from us.

## Part 4: Android and Firebase

Android does not need a VoIP push, because the SDK keeps a foreground service
running. Set this up anyway if you want the phone woken after Android has put
your app to sleep, which is what happens to an app left alone for a few days.

In the [Firebase console](https://console.firebase.google.com), open your
project, then **Project settings → Service accounts → Generate new private
key**. That downloads a JSON file.

Send us the whole file, by the same careful route as the `.p8`. It carries the
project ID and the service-account address alongside the key, so there is
nothing to copy out by hand.

There is no sandbox and production split on this side. One file covers every
build.

## Part 5: checking it works

Once we have uploaded your credentials, we check them against Apple
immediately, so a wrong Key ID is something we can tell you about while we are
still on the call. The check sends one push to a device token that belongs to
nobody. Apple checks the signature and the app before it looks for the handset,
so its refusal tells us exactly which part is wrong:

| What Apple says | What it means |
|---|---|
| `BadDeviceToken` | Everything is right. This is the pass: only the device was imaginary. |
| `InvalidProviderToken` | The key does not match the Key ID or the Team ID. |
| `TopicDisallowed` | The key is real, but it is not allowed to push to this app. Usually the topic-specific key was restricted to a different App ID. |
| `BadTopic` | The bundle ID is not one Apple recognises. |

We can read which key is meant to be waking your phones, and when it was last
proven to work, at any time, so ask us. If your app signs users in to
NativeTalk, it can read the same thing itself from `GET /push/status`:

```json
{
  "signing": {
    "apns": {
      "signedAs": "tenant",
      "ready": true,
      "topic": "com.yourcompany.yourapp.voip",
      "environments": [
        { "environment": "sandbox", "verifiedAt": "2026-10-16T09:12:00.000Z", "note": "accepted by Apple for topic com.yourcompany.yourapp.voip on sandbox" }
      ]
    }
  }
}
```

`signedAs: "tenant"` means your own key. `"platform"` means ours, which will
not wake your app. `"nobody"` means no handset on that platform can be woken at
all.

If `environments` lists only one entry, remember Part 2: the other kind of
build cannot be woken yet.

## Part 6: the one rule your app must not break

When iOS delivers a VoIP push, your app **must** report an incoming call to
CallKit before it tells iOS the push is handled. Every single time, including
when something went wrong.

```swift
func pushRegistry(_ registry: PKPushRegistry,
                  didReceiveIncomingPushWith payload: PKPushPayload,
                  for type: PKPushType,
                  completion: @escaping () -> Void) {

  // Report a call FIRST. Not inside an `if`, not after a `guard` that can
  // return early, not after an await. If anything here can skip
  // reportNewIncomingCall and still reach completion(), it will, on some
  // phone, one day.
  let update = CXCallUpdate()
  update.remoteHandle = CXHandle(type: .generic, value: callerName)

  provider.reportNewIncomingCall(with: callUUID, update: update) { error in
    if let error = error {
      // Still reported, still fine. Do not skip this branch.
      NSLog("CallKit refused the call: \(error.localizedDescription)")
    }
    completion()
  }
}
```

If the app finishes handling a VoIP push without reporting a call, iOS does two
things. It force quits the app, which the user sees as a crash. Then it **stops
delivering VoIP pushes to that handset** until the app is reinstalled.

That second part is what makes this worth a section of its own. The phone stops
ringing, permanently, and nothing in the app, in your logs or in ours says why,
because from our side the push was accepted by Apple every time. We have had
this exact fault on our own app. Reinstalling was the only fix.

So: no early return in that function that does not report a call first.

The full `AppDelegate.swift` is in
[push-notifications.md](push-notifications.md).

## Part 7: what the push contains

iOS, as the VoIP push payload:

```json
{
  "call_data": {
    "call_id": "f2b1c0a4-...",
    "caller": "+2348012345678",
    "extension": "1001",
    "decline_token": "…",
    "decline_url": "https://…/push/decline"
  }
}
```

Android, as a data message, with the same values one level up.

- `call_id` is the same on every handset rung for this call. Use it as your
  CallKit call UUID, so answering on one phone and the screen the user is
  looking at refer to the same call.
- `caller` is what to show. On a call where the number is masked this is not
  the real number, and `caller_ref` is a handle you can trade back to the CRM
  for a name.
- `extension` is who the call is for.
- `decline_token` and `decline_url` are only present when declining is the same
  thing as ending the call, which is not the case for a ring group. When they
  are there, posting the token to the URL hangs the call up straight away,
  rather than making the caller wait for the ring to time out.

The push expires after 30 seconds on iOS and 45 on Android. A wake-up that
arrives after the call stopped ringing would put a call screen on the phone for
a call that no longer exists, so we would rather it were dropped.

## Part 8: registering a handset

A push needs somewhere to go. Every handset has to tell us its token and the
extension it answers on, or there is nothing to send a wake-up to. This is the
step most often missing when the key is right and the phone still does not ring.

**From your backend, if your users sign in to your own system.** This is the
usual case for a company with its own app. Nobody on those phones is signed in
to NativeTalk, so the phone cannot register itself with us. Instead the app
sends its token to your backend, and your backend sends it to us with the same
API key it uses to create SIP devices, for the SIP device that person signs in
with:

```http
POST /api/sip/devices/{device_id}/push-token/
X-API-Key: <your company API key>

{
  "token": "<the device token, hex for iOS>",
  "platform": "ios",
  "environment": "sandbox"
}
```

We register the token against that device's own SIP username, so there is no
extension to send, and your key can only ever reach your own devices. A reply
with `"registered": true` means the phone will be woken for that device's
calls. When the person signs out, send the same token to
`DELETE /api/sip/devices/{device_id}/push-token/`, or their phone keeps ringing
for whoever signs in to that SIP device next. Both are in
[SIP Device API](SIP_DEVICE_API.md), sections 7 and 8.

Do not ask us for the provisioning key instead. There is one for the whole
platform and it is not scoped to a company, so it is not ours to hand out, and
holding it would make you responsible for every other company on it.

**From the app, if your users sign in with NativeTalk accounts.** Then the app
posts its own token, and the extension is the one on the signed-in account:

```http
POST /push/devices
Authorization: Bearer <that user's NativeTalk session>

{
  "token": "<the device token, hex for iOS>",
  "platform": "ios",
  "environment": "sandbox"
}
```

What to send with the token:

- `platform` is `ios` or `android`.
- `environment` is `sandbox` for a build signed with a development profile,
  which includes anything run from Xcode, and `production` for TestFlight and
  the App Store. It goes with every token, because it belongs to the build on
  that phone, and one person's phone can run an Xcode build one day and a
  TestFlight build the next. Get it wrong and we will usually recover, by
  retrying against the other Apple server, but we cannot recover if the key for
  that environment was never sent to us. Android ignores it.
- Leave out the bundle ID. We push to the app named on the key you gave us.
  Send `bundle_id` only if that key covers more than one of your apps, and then
  it must be the real bundle ID of the app on this phone.

`#if DEBUG` is the wrong test for that last one, because a Release build run on
a device from Xcode is still a development build and still sandbox. Read it off
the profile the build was actually signed with:

```swift
/// "sandbox" or "production", as Apple sees this build.
static func apsEnvironment() -> String {
  guard let url = Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision"),
        let data = try? Data(contentsOf: url),
        let text = String(data: data, encoding: .isoLatin1),
        let key = text.range(of: "<key>aps-environment</key>"),
        let close = text.range(of: "</string>", range: key.upperBound..<text.endIndex)
  else { return "production" }  // the App Store strips the profile
  let value = text[key.upperBound..<close.lowerBound]
  return value.contains("development") ? "sandbox" : "production"
}
```

An App Store build has no embedded profile at all, which is why the fallback is
`production`.

Send the token again whenever it changes. iOS issues a new one after a
reinstall, and an old token is a phone that will never ring.

## Checklist

- [ ] Push Notifications capability added in Xcode
- [ ] Background Modes: Voice over IP and Audio both ticked
- [ ] `NSMicrophoneUsageDescription` in Info.plist
- [ ] A topic-specific APNs key, restricted to your app
- [ ] Key ID, Team ID, bundle ID and environment noted down
- [ ] `.p8` sent to us by one-time link, not by chat or email
- [ ] Firebase service account JSON sent, if you want Android wake-ups
- [ ] Your backend registers each handset's token on every sign-in, with the right `environment`
- [ ] Your backend removes the token on sign-out
- [ ] `reportNewIncomingCall` called on every path through the push handler
- [ ] We have confirmed your key shows `signedAs: "tenant"` and a recent `verifiedAt`
- [ ] A real call to a real phone with the app swiped away

## If a phone still does not ring

Work down this list. It is in the order faults actually turn up.

1. **Was it a real build on a real device?** VoIP push does not work in the
   simulator.
2. **Is the Voice over IP background mode on?** Without it the phone registers
   for VoIP push and silently never gets one.
3. **Did registering the token say `"registered": true`?** If the token
   never reached us, there is nothing to wake. That is Part 8, and not a push
   problem at all. Check the app sends its token on every launch, and that your
   backend passes it on for the right SIP device.
4. **Is your key the one signing?** Ask us, or read `GET /push/status` if your
   app signs in to NativeTalk. If it says `platform`, your key is not uploaded
   and we are signing as ourselves, which Apple will refuse.
5. **Is there an entry for this build's environment?** A sandbox build with only
   a production key uploaded cannot be woken.
6. **Has the app ever been force quit by iOS?** If your push handler ever
   finished without reporting a call, that handset has stopped receiving VoIP
   pushes. Delete the app, reinstall it, and fix the handler. Nothing else
   brings it back.
7. **Ask us to re-check the key.** A key can stop working without anyone
   touching the app: revoked at Apple, or the App ID removed from its
   restriction. One request tells us, without placing a call.
