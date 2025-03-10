import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Textarea,
  toast,
} from "@renderer/components/ui";
import {
  ConversationShortcuts,
  MarkdownWrapper,
  PronunciationAssessmentScoreDetail,
  WavesurferPlayer,
} from "@renderer/components";
import { formatDateTime } from "@renderer/lib/utils";
import { t } from "i18next";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CopyIcon,
  DownloadIcon,
  EditIcon,
  ForwardIcon,
  GaugeCircleIcon,
  LoaderIcon,
  MicIcon,
  MoreVerticalIcon,
  SparklesIcon,
  Volume2Icon,
} from "lucide-react";
import { useContext, useEffect, useRef, useState } from "react";
import {
  AppSettingsProviderContext,
  ChatProviderContext,
  ChatSessionProviderContext,
} from "@renderer/context";
import { useAiCommand } from "@renderer/hooks";
import { md5 } from "js-md5";
import { useCopyToClipboard } from "@uidotdev/usehooks";

export const ChatUserMessage = (props: {
  chatMessage: ChatMessageType;
  isLastMessage: boolean;
}) => {
  const { chatMessage, isLastMessage } = props;
  const { recording } = chatMessage;
  const ref = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState<boolean>(false);
  const [content, setContent] = useState<string>(chatMessage.content);
  const { onUpdateMessage } = useContext(ChatSessionProviderContext);
  const [displayPlayer, setDisplayPlayer] = useState(isLastMessage);

  useEffect(() => {
    if (ref.current) {
      ref.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [ref]);

  return (
    <div ref={ref} className="mb-6">
      <div className="flex items-center space-x-2 justify-end mb-2">
        <div className="text-sm text-muted-foreground">
          {chatMessage.member.user.name}
        </div>
        <Avatar className="w-8 h-8 bg-background avatar">
          <AvatarImage src={chatMessage.member.user.avatarUrl}></AvatarImage>
          <AvatarFallback className="bg-background">
            {chatMessage.member.user.name}
          </AvatarFallback>
        </Avatar>
      </div>
      <div className="flex justify-end">
        <div className="flex flex-col gap-2 p-4 mb-2 bg-sky-500/30 border-sky-500 rounded-lg shadow-sm w-full max-w-prose">
          {recording &&
            (displayPlayer ? (
              <>
                <WavesurferPlayer
                  id={recording.id}
                  src={recording.src}
                  autoplay={true}
                />
                {recording?.pronunciationAssessment && (
                  <div className="flex justify-end">
                    <PronunciationAssessmentScoreDetail
                      assessment={recording.pronunciationAssessment}
                    />
                  </div>
                )}
              </>
            ) : (
              <Button
                onClick={() => setDisplayPlayer(true)}
                className="w-8 h-8"
                variant="ghost"
                size="icon"
              >
                <Volume2Icon className="w-5 h-5" />
              </Button>
            ))}
          {editing ? (
            <div className="">
              <Textarea
                className="bg-background mb-2"
                value={content}
                onChange={(event) => setContent(event.target.value)}
              />
              <div className="flex justify-end space-x-4">
                <Button
                  onClick={() => setEditing(false)}
                  variant="secondary"
                  size="sm"
                >
                  {t("cancel")}
                </Button>
                <Button
                  onClick={() =>
                    onUpdateMessage(chatMessage.id, { content }).finally(() =>
                      setEditing(false)
                    )
                  }
                  variant="default"
                  size="sm"
                >
                  {t("save")}
                </Button>
              </div>
            </div>
          ) : (
            <MarkdownWrapper className="select-text prose dark:prose-invert">
              {chatMessage.content}
            </MarkdownWrapper>
          )}
          <ChatUserMessageActions
            chatMessage={chatMessage}
            setContent={setContent}
            setEditing={setEditing}
          />
        </div>
      </div>
      <div className="flex justify-end text-xs text-muted-foreground timestamp">
        {formatDateTime(chatMessage.createdAt)}
      </div>
    </div>
  );
};

const ChatUserMessageActions = (props: {
  chatMessage: ChatMessageType;
  setContent: (content: string) => void;
  setEditing: (value: boolean) => void;
}) => {
  const { chatMessage, setContent, setEditing } = props;
  const { recording } = chatMessage;
  const [refinement, setRefinement] = useState<string>();
  const [refining, setRefining] = useState<boolean>(false);
  const [refinementVisible, setRefinementVisible] = useState<boolean>(true);
  const { refine } = useAiCommand();
  const [_, copyToClipboard] = useCopyToClipboard();
  const [copied, setCopied] = useState<boolean>(false);
  const { EnjoyApp } = useContext(AppSettingsProviderContext);
  const {
    chatMessages,
    startRecording,
    isRecording,
    isPaused,
    assessing,
    setAssessing,
    onDeleteMessage,
    submitting,
  } = useContext(ChatSessionProviderContext);
  const { currentChat } = useContext(ChatProviderContext);

  const handleRefine = async (params?: { reload?: boolean }) => {
    if (refining) return;
    if (!chatMessage.content) return;

    const { reload = false } = params || {};
    const cacheKey = `chat-message-refinement-${md5(chatMessage.id)}`;
    try {
      const cached = await EnjoyApp.cacheObjects.get(cacheKey);

      if (cached && !reload && !refinement) {
        setRefinement(cached);
      } else {
        setRefining(true);

        const context = `I'm chatting in a chatroom. The previous messages are as follows:\n\n${buildChatHistory()}`;
        const result = await refine(chatMessage.content, {
          learningLanguage: currentChat.language,
          context,
        });
        EnjoyApp.cacheObjects.set(cacheKey, result);
        setRefinement(result);
        setRefining(false);
      }
    } catch (err) {
      toast.error(err.message);
      setRefining(false);
    }
  };

  const buildChatHistory = () => {
    const messages = chatMessages.filter(
      (m) => new Date(m.createdAt) < new Date(chatMessage.createdAt)
    );
    return messages
      .map(
        (message) =>
          `${(message.member.user || message.member.agent).name}: ${
            message.content
          }`
      )
      .join("\n");
  };

  const handleDownload = () => {
    if (!chatMessage.recording) return;

    EnjoyApp.dialog
      .showSaveDialog({
        title: t("download"),
        defaultPath: chatMessage.recording.filename,
        filters: [
          {
            name: "Audio",
            extensions: [chatMessage.recording.filename.split(".").pop()],
          },
        ],
      })
      .then((savePath) => {
        if (!savePath) return;

        toast.promise(
          EnjoyApp.download.start(
            chatMessage.recording.src,
            savePath as string
          ),
          {
            loading: t("downloading", { file: chatMessage.recording.filename }),
            success: () => t("downloadedSuccessfully"),
            error: t("downloadFailed"),
            position: "bottom-right",
          }
        );
      })
      .catch((err) => {
        if (err) toast.error(err.message);
      });
  };
  return (
    <>
      <DropdownMenu>
        <div className="flex items-center justify-end space-x-4">
          {chatMessage.state === "pending" && (
            <>
              {submitting ? (
                <LoaderIcon className="w-4 h-4 animate-spin" />
              ) : (
                <EditIcon
                  data-tooltip-id="global-tooltip"
                  data-tooltip-content={t("edit")}
                  className="w-4 h-4 cursor-pointer"
                  onClick={() => {
                    setContent(chatMessage.content);
                    setEditing(true);
                  }}
                />
              )}
              {isPaused || isRecording || submitting ? (
                <LoaderIcon className="w-4 h-4 animate-spin" />
              ) : (
                <MicIcon
                  data-tooltip-id="global-tooltip"
                  data-tooltip-content={t("reRecord")}
                  className="w-4 h-4 cursor-pointer"
                  onClick={startRecording}
                />
              )}
            </>
          )}
          {chatMessage.recording &&
            (assessing ? (
              <LoaderIcon className="w-4 h-4 animate-spin" />
            ) : (
              <GaugeCircleIcon
                data-tooltip-id="global-tooltip"
                data-tooltip-content={t("pronunciationAssessment")}
                onClick={() => setAssessing(recording)}
                className="w-4 h-4 cursor-pointer"
              />
            ))}
          {refining ? (
            <LoaderIcon className="w-4 h-4 animate-spin" />
          ) : (
            <SparklesIcon
              data-tooltip-id="global-tooltip"
              data-tooltip-content={t("refine")}
              className="w-4 h-4 cursor-pointer"
              onClick={() => handleRefine()}
            />
          )}
          {copied ? (
            <CheckIcon className="w-4 h-4 text-green-500" />
          ) : (
            <CopyIcon
              data-tooltip-id="global-tooltip"
              data-tooltip-content={t("copyText")}
              className="w-4 h-4 cursor-pointer"
              onClick={() => {
                copyToClipboard(chatMessage.content);
                setCopied(true);
                setTimeout(() => {
                  setCopied(false);
                }, 3000);
              }}
            />
          )}
          <ConversationShortcuts
            prompt={chatMessage.content}
            excludedIds={[]}
            trigger={
              <ForwardIcon
                data-tooltip-id="global-tooltip"
                data-tooltip-content={t("forward")}
                className="w-4 h-4 cursor-pointer"
              />
            }
          />
          {Boolean(chatMessage.recording) && (
            <DownloadIcon
              data-tooltip-id="global-tooltip"
              data-tooltip-content={t("download")}
              data-testid="chat-message-download-recording"
              onClick={handleDownload}
              className="w-4 h-4 cursor-pointer"
            />
          )}
          <DropdownMenuTrigger>
            <MoreVerticalIcon className="w-4 h-4" />
          </DropdownMenuTrigger>
        </div>
        <DropdownMenuContent>
          <DropdownMenuItem
            className="cursor-pointer"
            onClick={() => onDeleteMessage(chatMessage.id)}
          >
            <span className="mr-auto text-destructive capitalize">
              {t("delete")}
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {refinement && (
        <div className="w-full bg-background rounded mt-4">
          <Collapsible
            open={refinementVisible}
            onOpenChange={(value) => setRefinementVisible(value)}
          >
            <CollapsibleTrigger asChild>
              <div className="flex items-center justify-between px-4 py-2 cursor-pointer">
                <div className="flex items-center space-x-2">
                  <SparklesIcon className="w-4 h-4" />
                  <span className="text-sm">{t("refine")}</span>
                </div>
                <Button
                  onClick={() => setRefinementVisible(!refinementVisible)}
                  variant="ghost"
                  size="icon"
                  className="w-6 h-6"
                >
                  {refinementVisible ? (
                    <ChevronRightIcon className="w-4 h-4" />
                  ) : (
                    <ChevronDownIcon className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="p-4 font-serif border-t max-h-96 overflow-y-auto">
                <MarkdownWrapper className="select-text prose dark:prose-invert">
                  {refinement}
                </MarkdownWrapper>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}
    </>
  );
};
