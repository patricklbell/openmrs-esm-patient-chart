import React, { useCallback } from 'react';
import { NumberInput, Select, SelectItem, TextInput, FormGroup, Button } from '@carbon/react';
import { useTranslation } from 'react-i18next';
import {
  type Control,
  Controller,
  type FieldErrors,
  useForm,
  type UseFormSetValue,
  UseFormWatch,
} from 'react-hook-form';
import { isCoded, isImage, isNumeric, isPanel, isText, type LabOrderConcept } from './lab-results.resource';
import { type Observation } from '../types/encounter';
import styles from './lab-results-form.scss';
import { Add, CloseFilled } from '@carbon/react/icons';
import { showModal, showSnackbar, type UploadedFile, useConfig } from '@openmrs/esm-framework';
import { useAllowedFileExtensions } from '@openmrs/esm-patient-common-lib';
import { type ConfigObject } from '../config-schema';

type ResultFormType = Record<string, unknown>;

interface ResultFormFieldProps {
  concept: LabOrderConcept;
  control: Control<ResultFormType>;
  defaultValue: Observation;
  errors: FieldErrors;
  setValue: UseFormSetValue<ResultFormType>;
}

const ResultFormField: React.FC<ResultFormFieldProps> = ({ concept, control, defaultValue, errors, setValue }) => {
  // TODO: Reference ranges should be dynamically adjusted based on patient demographics:
  // - Age-specific ranges (e.g., pediatric vs adult values)
  // - Gender-specific ranges where applicable
  const formatLabRange = (concept: LabOrderConcept) => {
    const hl7Abbreviation = concept?.datatype?.hl7Abbreviation;
    if (hl7Abbreviation !== 'NM') {
      return '';
    }

    const { hiAbsolute, lowAbsolute, units } = concept;
    const displayUnit = units ? ` ${units}` : '';

    const hasLowerLimit = lowAbsolute != null;
    const hasUpperLimit = hiAbsolute != null;

    if (hasLowerLimit && hasUpperLimit) {
      return ` (${lowAbsolute} - ${hiAbsolute} ${displayUnit})`;
    } else if (hasUpperLimit) {
      return ` (<= ${hiAbsolute} ${displayUnit})`;
    } else if (hasLowerLimit) {
      return ` (>= ${lowAbsolute} ${displayUnit})`;
    }
    return units ? ` (${displayUnit})` : '';
  };

  return (
    <>
      <ConceptField
        concept={concept}
        control={control}
        defaultValue={defaultValue}
        errors={errors}
        setValue={setValue}
        formatLabRange={formatLabRange}
      />

      {isPanel(concept) &&
        concept.setMembers.map((member) => (
          <React.Fragment key={member.uuid}>
            <ConceptField
              concept={member}
              control={control}
              defaultValue={defaultValue}
              errors={errors}
              setValue={setValue}
              formatLabRange={formatLabRange}
            />
          </React.Fragment>
        ))}
    </>
  );
};

interface ConceptFieldProps {
  concept: LabOrderConcept;
  defaultValue?: Observation;
  errors: FieldErrors;
  control: Control<ResultFormType>;
  setValue: UseFormSetValue<ResultFormType>;
  formatLabRange: (concept: LabOrderConcept) => string;
}

const ConceptField: React.FC<ConceptFieldProps> = ({
  concept,
  control,
  defaultValue,
  errors,
  setValue,
  formatLabRange,
}) => {
  const { t } = useTranslation();
  const config = useConfig<ConfigObject>();

  if (isImage(concept, config)) {
    return (
      <Controller
        name={concept.uuid}
        control={control}
        render={({ field }) => (
          <ImageHandlerInput
            value={field.value as UploadedFile}
            setValue={(v: UploadedFile) => setValue(field.name, v)}
            labelText={concept?.display || ''}
          />
        )}
      />
    );
  }

  if (isText(concept)) {
    return (
      <Controller
        control={control}
        name={concept.uuid}
        render={({ field }) => (
          <TextInput
            {...field}
            className={styles.textInput}
            id={concept.uuid}
            key={concept.uuid}
            labelText={`${concept?.display ? concept.display + ' ' : ''}${formatLabRange(concept)}`}
            type="text"
            invalidText={errors[concept.uuid]?.message}
            invalid={!!errors[concept.uuid]}
          />
        )}
      />
    );
  }

  if (isNumeric(concept)) {
    return (
      <Controller
        control={control}
        name={concept.uuid}
        render={({ field }) => (
          <NumberInput
            allowEmpty
            className={styles.numberInput}
            disableWheel
            hideSteppers
            id={concept.uuid}
            key={concept.uuid}
            label={`${concept?.display ? concept.display + ' ' : ''}${formatLabRange(concept)}`}
            onChange={(event) => field.onChange(parseFloat(event.target.value))}
            value={field.value || ''}
            invalidText={errors[concept.uuid]?.message}
            invalid={!!errors[concept.uuid]}
          />
        )}
      />
    );
  }

  const getSavedMemberValue = (conceptUuid: string, dataType: string) => {
    if (conceptUuid == defaultValue?.concept?.uuid) return defaultValue?.value;

    return dataType === 'Coded'
      ? defaultValue?.groupMembers?.find((member) => member.concept.uuid === conceptUuid)?.value?.uuid
      : defaultValue?.groupMembers?.find((member) => member.concept.uuid === conceptUuid)?.value;
  };

  if (isCoded(concept)) {
    return (
      <Controller
        name={concept.uuid}
        control={control}
        render={({ field }) => (
          <Select
            {...field}
            className={styles.textInput}
            defaultValue={getSavedMemberValue(concept.uuid, concept.datatype.display)}
            id={`select-${concept.uuid}`}
            key={concept.uuid}
            labelText={`${concept?.display ? concept.display + ' ' : ''}${formatLabRange(concept)}`}
            invalidText={errors[concept.uuid]?.message}
            invalid={!!errors[concept.uuid]}
          >
            <SelectItem text={t('chooseAnOption', 'Choose an option')} value="" />
            {concept?.answers?.length &&
              concept?.answers?.map((answer) => (
                <SelectItem key={answer.uuid} text={answer.display} value={answer.uuid}>
                  {answer.display}
                </SelectItem>
              ))}
          </Select>
        )}
      />
    );
  }
};

interface ImageHandlerInputProps {
  value: UploadedFile;
  setValue: (value: UploadedFile) => void;
  labelText: string;
}

const ImageHandlerInput: React.FC<ImageHandlerInputProps> = ({ value, setValue, labelText }) => {
  const { t } = useTranslation();
  const allowedFileExtensions = useAllowedFileExtensions();

  const showImageCaptureModal = useCallback(() => {
    const close = showModal('capture-photo-modal', {
      saveFile: (file: UploadedFile) => {
        if (file) {
          setValue(file);
        }

        close();
        return Promise.resolve();
      },
      closeModal: () => {
        close();
      },
      allowedExtensions:
        allowedFileExtensions && Array.isArray(allowedFileExtensions)
          ? allowedFileExtensions.filter((ext) => !/pdf/i.test(ext))
          : [],
      collectDescription: true,
      multipleFiles: true,
    });
  }, [allowedFileExtensions, setValue]);

  const handleRemoveImage = () => {
    setValue(undefined);

    showSnackbar({
      title: t('imageRemoved', 'Image removed'),
      kind: 'success',
      isLowContrast: true,
    });
  };

  return (
    <FormGroup legendText="">
      <p className={styles.imgUploadHelperText}>{labelText}</p>
      <Button
        className={styles.uploadButton}
        kind="tertiary"
        onClick={showImageCaptureModal}
        renderIcon={(props) => <Add size={16} {...props} />}
      >
        {t('addImage', 'Add image')}
      </Button>

      <div className={styles.imgThumbnailGrid}>
        {value && (
          <div className={styles.imgThumbnailItem}>
            <div className={styles.imgThumbnailContainer}>
              <img
                className={styles.imgThumbnail}
                src={value.base64Content}
                alt={value.fileDescription ?? value.fileName}
              />
            </div>
            <Button kind="ghost" className={styles.removeButton} onClick={() => handleRemoveImage()}>
              <CloseFilled size={16} className={styles.closeIcon} />
            </Button>
          </div>
        )}
      </div>
    </FormGroup>
  );
};

export default ResultFormField;
